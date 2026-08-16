import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { problemsForDate } from "@/lib/progress";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ date: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  return NextResponse.json(await problemsForDate(user.id, date));
}
