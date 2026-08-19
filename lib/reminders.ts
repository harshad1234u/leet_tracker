import { sql, id, now } from "@/lib/db";
import { isTodayComplete, settingsFor } from "@/lib/progress";
import { localClock, localDate } from "@/lib/time";
import { isMockMode, reminderMessages, whatsappProvider } from "@/lib/whatsapp";

const MAX_RETRIES = 3;
const STALE_SENDING_MS = 5 * 60_000;

export const retryDelayMs = (retryCount: number) =>
  Math.min(5 * 60_000 * 2 ** Math.max(0, retryCount - 1), 60 * 60_000);

export const isTransientFailure = (error: unknown) =>
  !(error instanceof Error && /400|401|403|404|invalid/i.test(error.message));

export async function sweepStaleReminders(at = new Date()) {
  const cutoff = new Date(at.getTime() - STALE_SENDING_MS).toISOString();
  const res = await sql`UPDATE reminders SET status = 'Retrying', error_info = 'Stale sending recovery', updated_at = ${now()} WHERE status = 'Sending' AND updated_at < ${cutoff}::timestamptz`;
  return res.count;
}

export async function processReminders(at = new Date()) {
  await sweepStaleReminders(at);
  const users = await sql<{ user_id: string }[]>`SELECT user_id FROM reminder_settings WHERE enabled = true AND phone_number IS NOT NULL AND phone_number != ''`;
  let sent = 0;

  for (const { user_id } of users) {
    const setting = await settingsFor(user_id);
    if (!setting.phone_number) continue;
    const date = localDate(setting.timezone, at);
    const clock = localClock(setting.timezone, at);
    if (clock < setting.start_time || clock > setting.cutoff_time || (await isTodayComplete(user_id, date))) continue;

    const [retry] = await sql<{
      id: string;
      recipient: string;
      message_index: number;
      retry_count: number;
      attempted_at: string | Date;
    }[]>`SELECT id, recipient, message_index, retry_count, attempted_at FROM reminders WHERE user_id = ${user_id} AND local_date = ${date}::date AND status = 'Retrying' ORDER BY attempted_at ASC LIMIT 1`;

    if (retry) {
      if (retry.retry_count >= MAX_RETRIES) {
        await sql`UPDATE reminders SET status = 'Failed', error_info = 'Retry limit reached', updated_at = ${now()} WHERE id = ${retry.id} AND status = 'Retrying'`;
        continue;
      }
      if (at.getTime() - new Date(retry.attempted_at).getTime() < retryDelayMs(retry.retry_count)) continue;

      const claimed = await sql`UPDATE reminders SET status = 'Sending', updated_at = ${now()} WHERE id = ${retry.id} AND status = 'Retrying'`;
      if (claimed.count === 0) continue;

      try {
        const delivery = await whatsappProvider().sendReminder(
          retry.recipient,
          reminderMessages[retry.message_index],
          { name: setting.template_name, language: setting.template_language }
        );
        await sql`UPDATE reminders SET status = 'Sent', provider_message_id = ${delivery.providerMessageId}, attempted_at = ${now()}, updated_at = ${now()} WHERE id = ${retry.id} AND status = 'Sending'`;
        sent++;
      } catch (error) {
        const canRetry = isTransientFailure(error) && retry.retry_count < MAX_RETRIES;
        const errStr = error instanceof Error ? error.message.slice(0, 500) : "Unknown provider error";
        await sql`UPDATE reminders SET status = ${canRetry ? "Retrying" : "Failed"}, retry_count = retry_count + 1, error_info = ${errStr}, attempted_at = ${now()}, updated_at = ${now()} WHERE id = ${retry.id}`;
      }
      continue;
    }

    const [last] = await sql<{ scheduled_at: string | Date }[]>`SELECT scheduled_at FROM reminders WHERE user_id = ${user_id} AND local_date = ${date}::date AND status IN ('Sent', 'Delivered', 'Sending') ORDER BY scheduled_at DESC LIMIT 1`;
    if (last && at.getTime() - new Date(last.scheduled_at).getTime() < setting.interval_minutes * 60000) continue;

    const scheduled = at.toISOString();
    const reminderId = id();
    const messageIndex = Math.floor(at.getTime() / 60000) % reminderMessages.length;

    const claimed = await sql`INSERT INTO reminders (id, user_id, local_date, scheduled_at, recipient, status, message_index, created_at, updated_at) VALUES (${reminderId}, ${user_id}, ${date}::date, ${scheduled}, ${setting.phone_number}, 'Sending', ${messageIndex}, ${now()}, ${now()}) ON CONFLICT (user_id, scheduled_at) DO NOTHING`;

    if (claimed.count === 0) continue;

    const message = reminderMessages[messageIndex];
    try {
      const delivery = await whatsappProvider().sendReminder(
        setting.phone_number,
        message,
        { name: setting.template_name, language: setting.template_language }
      );
      await sql`UPDATE reminders SET status = 'Sent', provider_message_id = ${delivery.providerMessageId}, attempted_at = ${now()}, updated_at = ${now()} WHERE id = ${reminderId} AND status = 'Sending'`;
      sent++;
    } catch (error) {
      const canRetry = isTransientFailure(error);
      const errStr = error instanceof Error ? error.message.slice(0, 500) : "Unknown provider error";
      await sql`UPDATE reminders SET status = ${canRetry ? "Retrying" : "Failed"}, retry_count = retry_count + 1, error_info = ${errStr}, attempted_at = ${now()}, updated_at = ${now()} WHERE id = ${reminderId}`;
    }
  }

  return { sent, mockMode: isMockMode() };
}

export async function updateDelivery(providerId: string, status: "Delivered" | "Failed") {
  const res = await sql`UPDATE reminders SET status = ${status}, updated_at = ${now()} WHERE provider_message_id = ${providerId} AND status IN ('Sent', 'Sending')`;
  return res.count;
}
