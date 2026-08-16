import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { sql, now } from "@/lib/db";
import { isValidTimeZone } from "@/lib/time";

export const runtime = "nodejs";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z
  .object({
    enabled: z.boolean(),
    startTime: time,
    intervalMinutes: z.coerce.number().int().min(15).max(360),
    cutoffTime: time,
    timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone"),
    phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
    templateName: z.string().min(1).max(100),
    templateLanguage: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
  })
  .refine((value) => value.cutoffTime >= value.startTime, {
    message: "Cutoff must be after start time",
    path: ["cutoffTime"],
  });

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const v = schema.parse(await request.json());
    await sql`UPDATE reminder_settings SET enabled = ${v.enabled}, start_time = ${v.startTime}, interval_minutes = ${v.intervalMinutes}, cutoff_time = ${v.cutoffTime}, timezone = ${v.timezone}, phone_number = ${v.phoneNumber || null}, template_name = ${v.templateName}, template_language = ${v.templateLanguage}, updated_at = ${now()} WHERE user_id = ${user.id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof z.ZodError ? error.issues[0].message : "Could not save settings." },
      { status: 400 }
    );
  }
}
