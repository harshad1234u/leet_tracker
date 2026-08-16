import { NextResponse } from "next/server";
import { processReminders } from "@/lib/reminders";
export const runtime = "nodejs";
export async function GET(request: Request) { const auth = request.headers.get("authorization"); if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json(await processReminders()); }
