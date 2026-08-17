import { sql, id, now } from "@/lib/db";
import { localDate, streakFromDates } from "@/lib/time";

export type ProblemInput = {
  name: string;
  number: number;
  difficulty: "Easy" | "Medium" | "Hard";
  url: string;
  solvedAt?: string;
};

export async function settingsFor(userId: string) {
  const [setting] = await sql<{
    enabled: boolean | number;
    timezone: string;
    start_time: string;
    interval_minutes: number;
    cutoff_time: string;
    phone_number: string | null;
    template_name: string;
    template_language: string;
  }[]>`SELECT enabled, timezone, start_time, interval_minutes, cutoff_time, phone_number, template_name, template_language FROM reminder_settings WHERE user_id = ${userId}`;

  if (!setting) {
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "leetcode_reminder";
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
    const updated = now();
    try {
      await sql`INSERT INTO reminder_settings (user_id, template_name, template_language, updated_at) VALUES (${userId}, ${templateName}, ${templateLang}, ${updated}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO whatsapp_connections (user_id, status, updated_at) VALUES (${userId}, 'Mock', ${updated}) ON CONFLICT DO NOTHING`;
    } catch (e) {
      console.error("Auto provision settings error:", e);
    }
    return {
      enabled: 1,
      timezone: "UTC",
      start_time: "17:00",
      interval_minutes: 60,
      cutoff_time: "22:00",
      phone_number: null,
      template_name: templateName,
      template_language: templateLang,
    };
  }
  return {
    ...setting,
    enabled: setting.enabled ? 1 : 0,
  };
}

export async function completedDates(userId: string) {
  const rows = await sql<{ local_date: string }[]>`SELECT local_date::text FROM daily_progress WHERE user_id = ${userId} AND completed_at IS NOT NULL ORDER BY local_date`;
  return rows.map((x: any) => String(x.local_date).slice(0, 10));
}

export async function isTodayComplete(userId: string, date: string) {
  const rows = await sql`SELECT 1 FROM daily_progress WHERE user_id = ${userId} AND local_date = ${date}::date AND completed_at IS NOT NULL LIMIT 1`;
  return rows.length > 0;
}

export async function statsFor(userId: string) {
  const setting = await settingsFor(userId);
  const today = localDate(setting.timezone);
  const dates = await completedDates(userId);
  const streak = streakFromDates(dates, today);
  const [{ count }] = await sql<{ count: string | number }[]>`SELECT COUNT(*) as count FROM solved_problems WHERE user_id = ${userId}`;
  const totalProblems = Number(count);
  const milestones = [7, 30, 60, 100];
  const next = milestones.find((value) => value > streak.current) ?? null;
  return {
    ...streak,
    totalProblems,
    completedDays: dates.length,
    nextMilestone: next,
    milestone: [...milestones].reverse().find((value) => streak.current >= value) ?? 0,
    today,
  };
}

export async function logProblem(userId: string, input: ProblemInput) {
  const setting = await settingsFor(userId);
  const date = localDate(setting.timezone, input.solvedAt ? new Date(input.solvedAt) : new Date());
  const timestamp = input.solvedAt || now();
  const created = now();

  await sql.begin(async (tx: any) => {
    const [existing] = await tx<{ id: string; completed_at: string | Date | null }[]>`SELECT id, completed_at FROM daily_progress WHERE user_id = ${userId} AND local_date = ${date}::date`;
    let progressId: string;
    if (!existing) {
      progressId = id();
      await tx`INSERT INTO daily_progress (id, user_id, local_date, completed_at, created_at) VALUES (${progressId}, ${userId}, ${date}::date, ${timestamp}, ${created})`;
    } else {
      progressId = existing.id;
      if (!existing.completed_at) {
        await tx`UPDATE daily_progress SET completed_at = ${timestamp} WHERE id = ${progressId}`;
      }
    }
    await tx`INSERT INTO solved_problems (id, user_id, progress_id, name, problem_number, difficulty, leetcode_url, solved_at, created_at) VALUES (${id()}, ${userId}, ${progressId}, ${input.name}, ${input.number}, ${input.difficulty}, ${input.url}, ${timestamp}, ${created})`;
    await tx`UPDATE reminders SET status = 'Cancelled', updated_at = ${created} WHERE user_id = ${userId} AND local_date = ${date}::date AND status IN ('Scheduled', 'Retrying')`;
  });

  const stats = await statsFor(userId);
  const message = await awardMilestone(userId, stats.current);
  return { date, stats, milestone: message };
}

async function awardMilestone(userId: string, streak: number) {
  const milestone = [100, 60, 30, 7].find((value) => streak >= value);
  if (!milestone) return null;
  const newId = id();
  const created = now();
  const result = await sql`INSERT INTO milestone_achievements (id, user_id, milestone_days, achieved_at) VALUES (${newId}, ${userId}, ${milestone}, ${created}) ON CONFLICT (user_id, milestone_days) DO NOTHING`;
  return result.count > 0 ? milestone : null;
}

export async function dashboardFor(userId: string) {
  const settings = await settingsFor(userId);
  const stats = await statsFor(userId);
  const [todayProgress] = await sql<{ id: string; completed_at: string | Date | null }[]>`SELECT id, completed_at FROM daily_progress WHERE user_id = ${userId} AND local_date = ${stats.today}::date`;
  const todayProblems = todayProgress
    ? await sql`SELECT id, name, problem_number, difficulty, leetcode_url, solved_at::text FROM solved_problems WHERE progress_id = ${todayProgress.id} ORDER BY solved_at DESC`
    : [];
  const recent = await sql`SELECT p.local_date::text, p.completed_at::text, s.name, s.problem_number, s.difficulty, s.leetcode_url, s.solved_at::text FROM daily_progress p LEFT JOIN solved_problems s ON s.progress_id = p.id WHERE p.user_id = ${userId} AND p.completed_at IS NOT NULL ORDER BY p.local_date DESC, s.solved_at DESC LIMIT 12`;
  const reminders = await sql`SELECT id, user_id, local_date::text, scheduled_at::text, attempted_at::text, recipient, provider_message_id, status, retry_count, error_info, message_index, created_at::text, updated_at::text FROM reminders WHERE user_id = ${userId} AND local_date = ${stats.today}::date ORDER BY scheduled_at ASC`;
  const achievements = await sql<{ milestone_days: number }[]>`SELECT milestone_days FROM milestone_achievements WHERE user_id = ${userId} AND dismissed_at IS NULL ORDER BY milestone_days DESC`;
  const dates = await completedDates(userId);

  return {
    settings,
    stats,
    todayProgress: todayProgress ? { ...todayProgress, completed_at: todayProgress.completed_at ? new Date(todayProgress.completed_at).toISOString() : null } : null,
    todayProblems: todayProblems.map((p: any) => ({ ...p, solved_at: p.solved_at ? new Date(p.solved_at).toISOString() : null })),
    recent: recent.map((p: any) => ({ ...p, local_date: String(p.local_date).slice(0, 10), solved_at: p.solved_at ? new Date(p.solved_at).toISOString() : null })),
    reminders: reminders.map((r: any) => ({ ...r, local_date: String(r.local_date).slice(0, 10) })),
    completedDates: dates,
    celebration: achievements[0]?.milestone_days ?? null,
  };
}

export async function dismissMilestone(userId: string, milestone: number) {
  await sql`UPDATE milestone_achievements SET dismissed_at = ${now()} WHERE user_id = ${userId} AND milestone_days = ${milestone}`;
}

export async function problemsForDate(userId: string, date: string) {
  const [progress] = await sql<{ id: string }[]>`SELECT id FROM daily_progress WHERE user_id = ${userId} AND local_date = ${date}::date`;
  if (!progress) return [];
  const problems = await sql<{ id: string; name: string; problem_number: number; difficulty: string; leetcode_url: string; solved_at: string | Date | null }[]>`SELECT id, name, problem_number, difficulty, leetcode_url, solved_at::text FROM solved_problems WHERE progress_id = ${progress.id} ORDER BY solved_at ASC`;
  return problems.map((p: any) => ({ ...p, solved_at: p.solved_at ? new Date(p.solved_at).toISOString() : null }));
}
