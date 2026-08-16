import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { logProblem } from "@/lib/progress";

export const runtime = "nodejs";
const schema = z.object({
  name: z.string().trim().min(1).max(160),
  number: z.coerce.number().int().positive().max(100000),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  url: z
    .string()
    .url()
    .refine((value) => /^https:\/\/(www\.)?leetcode\.com\//.test(value), "Use a LeetCode URL"),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const res = await logProblem(user.id, schema.parse(await request.json()));
    return NextResponse.json(res, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof z.ZodError ? error.issues[0].message : "Could not save the problem." },
      { status: 400 }
    );
  }
}
