import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dashboardFor } from "@/lib/progress";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  return user ? NextResponse.json(await dashboardFor(user.id)) : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
