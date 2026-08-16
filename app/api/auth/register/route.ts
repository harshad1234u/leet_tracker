import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser } from "@/lib/auth";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const userId = await createUser(input.email, input.password);
    await createSession(userId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof z.ZodError ? "Enter a valid email and password (8+ characters)." : "That email is already registered." },
      { status: 400 }
    );
  }
}
