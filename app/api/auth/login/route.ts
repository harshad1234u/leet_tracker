import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();

    const [user] = await sql<
      { id: string; password_hash: string }[]
    >`SELECT id, password_hash FROM users WHERE email = ${email}`;

    if (!user) {
      // Auto-create user account on first login since registration page is removed
      const userId = await createUser(email, input.password);
      await createSession(userId);
      return NextResponse.json({ ok: true });
    }

    if (!verifyPassword(input.password, user.password_hash)) {
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401 }
      );
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Please enter a valid email address and password." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }
}

