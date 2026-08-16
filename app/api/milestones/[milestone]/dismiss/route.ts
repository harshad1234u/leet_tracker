import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dismissMilestone } from "@/lib/progress";

export async function POST(_: Request, { params }: { params: Promise<{ milestone: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const milestone = Number((await params).milestone);
  if (![7, 30, 60, 100].includes(milestone)) return NextResponse.json({ error: "Invalid milestone" }, { status: 400 });
  await dismissMilestone(user.id, milestone);
  return NextResponse.json({ ok: true });
}
