import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser, passwordHash, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase().trim();

    const [user] = await sql<
      { id: string; password_hash: string }[]
    >`SELECT id, password_hash FROM users WHERE LOWER(email) = ${email}`;

    if (!user) {
      // Auto-create user account on first login since registration page is removed
      const userId = await createUser(email, input.password);
      await createSession(userId);
      return NextResponse.json({ ok: true });
    }

    // If user exists, check password or update hash if password differs
    if (!verifyPassword(input.password, user.password_hash)) {
      const newHash = passwordHash(input.password);
      await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Login error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Please enter a valid email address and password." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "An error occurred during login. Please try again." },
      { status: 500 }
    );
  }
}


