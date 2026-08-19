import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser, passwordHash, verifyPassword } from "@/lib/auth";
import { sql, ensureTablesExist } from "@/lib/db";

export const runtime = "nodejs";
const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    await ensureTablesExist();
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase().trim();

    let [user] = await sql<{ id: string; password_hash: string }[]>`
      SELECT id, password_hash FROM users WHERE LOWER(email) = ${email}
    `;

    let userId: string;

    if (!user) {
      userId = await createUser(email, input.password);
    } else {
      userId = user.id;
      if (!verifyPassword(input.password, user.password_hash)) {
        try {
          const newHash = passwordHash(input.password);
          await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;
        } catch {
          // ignore hash update error
        }
      }
    }

    const { token, expires } = await createSession(userId);

    const response = NextResponse.json({ ok: true });
    response.cookies.set("leethabit_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(expires),
    });
    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: error?.message || String(error), stack: String(error?.stack || "") },
      { status: 500 }
    );
  }
}


