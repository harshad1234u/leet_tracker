import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const [user] = await sql<{ id: string; password_hash: string }[]>`SELECT id, password_hash FROM users WHERE email = ${input.email.toLowerCase()}`;
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }
}
