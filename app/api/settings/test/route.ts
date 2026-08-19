import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { settingsFor } from "@/lib/progress";
import { reminderMessages, whatsappProvider, isMockMode } from "@/lib/whatsapp";
import { sql, now } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const settings = await settingsFor(user.id);
  const phoneNumber = body.phoneNumber || settings.phone_number;
  const templateName = body.templateName || settings.template_name;
  const templateLanguage = body.templateLanguage || settings.template_language;

  if (!phoneNumber) return NextResponse.json({ error: "Add a WhatsApp number first." }, { status: 400 });

  try {
    await whatsappProvider().sendReminder(phoneNumber, reminderMessages[0], {
      name: templateName,
      language: templateLanguage,
    });
    await sql`UPDATE whatsapp_connections SET status = ${isMockMode() ? "Mock" : "Connected"}, last_error = NULL, updated_at = ${now()} WHERE user_id = ${user.id}`;
    return NextResponse.json({ ok: true, mockMode: isMockMode() });
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : "The test reminder could not be sent.";
    await sql`UPDATE whatsapp_connections SET status = 'Error', last_error = ${errMsg.slice(0, 500)}, updated_at = ${now()} WHERE user_id = ${user.id}`;
    return NextResponse.json(
      { error: errMsg },
      { status: 502 }
    );
  }
}
