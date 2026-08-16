import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { settingsFor } from "@/lib/progress";
import { reminderMessages, whatsappProvider, isMockMode } from "@/lib/whatsapp";
import { sql, now } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await settingsFor(user.id);
  if (!settings.phone_number) return NextResponse.json({ error: "Add a WhatsApp number first." }, { status: 400 });
  try {
    await whatsappProvider().sendReminder(settings.phone_number, reminderMessages[0], {
      name: settings.template_name,
      language: settings.template_language,
    });
    await sql`UPDATE whatsapp_connections SET status = ${isMockMode() ? "Mock" : "Connected"}, last_error = NULL, updated_at = ${now()} WHERE user_id = ${user.id}`;
    return NextResponse.json({ ok: true, mockMode: isMockMode() });
  } catch {
    await sql`UPDATE whatsapp_connections SET status = 'Error', last_error = 'Test request failed', updated_at = ${now()} WHERE user_id = ${user.id}`;
    return NextResponse.json(
      { error: "The test reminder could not be sent. Check the WhatsApp configuration." },
      { status: 502 }
    );
  }
}
