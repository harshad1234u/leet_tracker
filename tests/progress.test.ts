import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "../lib/db";
import { createUser } from "../lib/auth";
import { logProblem, statsFor, isTodayComplete, problemsForDate } from "../lib/progress";
import { processReminders, updateDelivery, retryDelayMs, isTransientFailure, sweepStaleReminders } from "../lib/reminders";
import { localDate, shiftDate } from "../lib/time";

const problem = { name: "Two Sum", number: 1, difficulty: "Easy" as const, url: "https://leetcode.com/problems/two-sum/" };

async function clearDb() {
  await sql`DELETE FROM reminders`;
  await sql`DELETE FROM milestone_achievements`;
  await sql`DELETE FROM solved_problems`;
  await sql`DELETE FROM daily_progress`;
  await sql`DELETE FROM reminder_settings`;
  await sql`DELETE FROM whatsapp_connections`;
  await sql`DELETE FROM sessions`;
  await sql`DELETE FROM users`;
}

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await sql.end();
});

async function user() {
  return await createUser(`test-${crypto.randomUUID()}@example.test`, "password-123");
}

async function setReminder(userId: string) {
  await sql`UPDATE reminder_settings SET enabled = true, timezone = 'UTC', start_time = '00:00', cutoff_time = '23:59', interval_minutes = 60, phone_number = '+14155552671' WHERE user_id = ${userId}`;
}

describe("daily progress and reminders", () => {
  it("completes a daily goal and counts multiple problems once", async () => {
    const userId = await user();
    await logProblem(userId, problem);
    await logProblem(userId, { ...problem, name: "Valid Parentheses", number: 20 });
    const stats = await statsFor(userId);
    expect(stats).toMatchObject({ current: 1, totalProblems: 2, completedDays: 1 });
  });

  it("sends once for an incomplete goal and resists duplicate scheduler execution", async () => {
    const userId = await user();
    await setReminder(userId);
    const at = new Date();
    expect((await processReminders(at)).sent).toBe(1);
    expect((await processReminders(at)).sent).toBe(0);
    const [{ count }] = await sql<{ count: string | number }[]>`SELECT COUNT(*) count FROM reminders WHERE user_id = ${userId} AND status = 'Sent'`;
    expect(Number(count)).toBe(1);
  });

  it("does not send when reminders are disabled", async () => {
    const userId = await user();
    await sql`UPDATE reminder_settings SET enabled = false, timezone = 'UTC', start_time = '00:00', cutoff_time = '23:59', phone_number = '+14155552671' WHERE user_id = ${userId}`;
    expect((await processReminders(new Date())).sent).toBe(0);
    const [{ count }] = await sql<{ count: string | number }[]>`SELECT COUNT(*) count FROM reminders WHERE user_id = ${userId}`;
    expect(Number(count)).toBe(0);
  });

  it("cancels future reminders and sends none after a problem is logged", async () => {
    const userId = await user();
    await setReminder(userId);
    const at = new Date();
    await processReminders(at);
    const remId = crypto.randomUUID();
    const futureDate = new Date(at.getTime() + 61 * 60000).toISOString();
    const dateStr = localDate("UTC", at);
    await sql`INSERT INTO reminders (id, user_id, local_date, scheduled_at, recipient, status, created_at, updated_at) VALUES (${remId}, ${userId}, ${dateStr}::date, ${futureDate}, '+14155552671', 'Scheduled', ${at.toISOString()}, ${at.toISOString()})`;
    await logProblem(userId, problem);
    const [cancelled] = await sql<{ status: string }[]>`SELECT status FROM reminders WHERE user_id = ${userId} AND status = 'Cancelled'`;
    expect(cancelled?.status).toBe("Cancelled");
    expect((await processReminders(new Date(at.getTime() + 61 * 60000))).sent).toBe(0);
  });

  it("updates a delivery callback once", async () => {
    const userId = await user();
    await setReminder(userId);
    await processReminders(new Date());
    const [reminder] = await sql<{ provider_message_id: string }[]>`SELECT provider_message_id FROM reminders WHERE user_id = ${userId}`;
    expect(await updateDelivery(reminder.provider_message_id, "Delivered")).toBe(1);
    expect(await updateDelivery(reminder.provider_message_id, "Delivered")).toBe(0);
  });

  it("classifies permanent WhatsApp errors and bounds retry backoff", () => {
    expect(isTransientFailure(new Error("Meta API request failed (401)"))).toBe(false);
    expect(isTransientFailure(new Error("network timeout"))).toBe(true);
    expect(retryDelayMs(1)).toBe(5 * 60_000);
    expect(retryDelayMs(20)).toBe(60 * 60_000);
  });

  it("records a milestone exactly once", async () => {
    const userId = await user();
    const today = localDate("UTC");
    for (let offset = 6; offset >= 0; offset--) {
      const day = shiftDate(today, -offset);
      await logProblem(userId, { ...problem, number: offset + 1, solvedAt: `${day}T12:00:00.000Z` });
    }
    await logProblem(userId, { ...problem, name: "Extra", number: 99 });
    const [{ count }] = await sql<{ count: string | number }[]>`SELECT COUNT(*) count FROM milestone_achievements WHERE user_id = ${userId} AND milestone_days = 7`;
    expect(Number(count)).toBe(1);
  });

  it("breaks current streak after a missed day", async () => {
    const userId = await user();
    const today = localDate("UTC");
    await logProblem(userId, { ...problem, number: 1, solvedAt: `${shiftDate(today, -3)}T12:00:00.000Z` });
    await logProblem(userId, { ...problem, number: 2, solvedAt: `${shiftDate(today, -2)}T12:00:00.000Z` });
    await logProblem(userId, { ...problem, number: 3, solvedAt: `${today}T12:00:00.000Z` });
    const stats = await statsFor(userId);
    expect(stats.current).toBe(1);
    expect(stats.longest).toBe(2);
  });

  it("does not send reminder when problem solved before start time", async () => {
    const userId = await user();
    await sql`UPDATE reminder_settings SET enabled = true, timezone = 'UTC', start_time = '17:00', cutoff_time = '23:59', interval_minutes = 60, phone_number = '+14155552671' WHERE user_id = ${userId}`;
    await logProblem(userId, problem);
    const at = new Date();
    at.setUTCHours(18, 0, 0, 0);
    expect((await processReminders(at)).sent).toBe(0);
  });

  it("recovers stale Sending reminders to Retrying", async () => {
    const userId = await user();
    await setReminder(userId);
    const staleTime = new Date(Date.now() - 10 * 60_000).toISOString();
    const dateStr = localDate("UTC");
    await sql`INSERT INTO reminders (id, user_id, local_date, scheduled_at, recipient, status, created_at, updated_at) VALUES (${crypto.randomUUID()}, ${userId}, ${dateStr}::date, ${staleTime}, '+14155552671', 'Sending', ${staleTime}, ${staleTime})`;
    const swept = await sweepStaleReminders(new Date());
    expect(swept).toBe(1);
    const [retried] = await sql<{ status: string }[]>`SELECT status FROM reminders WHERE user_id = ${userId} AND status = 'Retrying'`;
    expect(retried?.status).toBe("Retrying");
  });

  it("isolates data between multiple users", async () => {
    const userA = await user();
    const userB = await user();
    await setReminder(userA);
    await setReminder(userB);
    await logProblem(userA, problem);
    const at = new Date();
    const result = await processReminders(at);
    expect(result.sent).toBe(1);
    const [{ count: countB }] = await sql<{ count: string | number }[]>`SELECT COUNT(*) count FROM reminders WHERE user_id = ${userB} AND status = 'Sent'`;
    const [{ count: countA }] = await sql<{ count: string | number }[]>`SELECT COUNT(*) count FROM reminders WHERE user_id = ${userA} AND status = 'Sent'`;
    expect(Number(countB)).toBe(1);
    expect(Number(countA)).toBe(0);
  });

  it("isTodayComplete returns correct boolean", async () => {
    const userId = await user();
    const today = localDate("UTC");
    expect(await isTodayComplete(userId, today)).toBe(false);
    await logProblem(userId, problem);
    expect(await isTodayComplete(userId, today)).toBe(true);
    expect(await isTodayComplete(userId, shiftDate(today, -1))).toBe(false);
  });

  it("problemsForDate returns all problems for a specific date", async () => {
    const userId = await user();
    const today = localDate("UTC");
    await logProblem(userId, { ...problem, name: "Two Sum", number: 1 });
    await logProblem(userId, { ...problem, name: "Valid Parentheses", number: 20 });
    const problems = await problemsForDate(userId, today);
    expect(problems).toHaveLength(2);
    expect(problems[0].name).toBe("Two Sum");
    expect(problems[1].name).toBe("Valid Parentheses");
    expect(await problemsForDate(userId, shiftDate(today, -1))).toHaveLength(0);
  });
});
