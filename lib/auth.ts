import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql, id, now } from "@/lib/db";

const COOKIE = "leethabit_session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const passwordHash = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};

export const verifyPassword = (password: string, stored: string) => {
  try {
    if (!stored || typeof stored !== "string" || !stored.includes(":")) {
      return false;
    }
    const [salt, value] = stored.split(":");
    if (!salt || !value) return false;
    const candidate = scryptSync(password, salt, 64).toString("hex");
    const bufValue = Buffer.from(value, "hex");
    const bufCandidate = Buffer.from(candidate, "hex");
    if (bufValue.length !== bufCandidate.length) {
      return false;
    }
    return timingSafeEqual(bufValue, bufCandidate);
  } catch {
    return false;
  }
};

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hash(token);
  const [session] = await sql<{ user_id: string; expires_at: string | Date }[]>`SELECT user_id, expires_at FROM sessions WHERE id = ${tokenHash}`;
  if (!session || new Date(session.expires_at) < new Date()) return null;
  const [user] = await sql<{ id: string; email: string }[]>`SELECT id, email FROM users WHERE id = ${session.user_id}`;
  return user || null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 30 * 864e5).toISOString();
  const tokenHash = hash(token);
  await sql`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (${tokenHash}, ${userId}, ${expires}, ${now()})`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function logout() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) {
    const tokenHash = hash(token);
    await sql`DELETE FROM sessions WHERE id = ${tokenHash}`;
  }
  (await cookies()).delete(COOKIE);
}

export async function createUser(email: string, password: string) {
  const userId = id();
  const created = now();
  const pwdHash = passwordHash(password);
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "leetcode_reminder";
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

  await sql.begin(async (transactionSql: any) => {
    await transactionSql`INSERT INTO users (id, email, password_hash, created_at) VALUES (${userId}, ${email.toLowerCase()}, ${pwdHash}, ${created})`;
    await transactionSql`INSERT INTO reminder_settings (user_id, template_name, template_language, updated_at) VALUES (${userId}, ${templateName}, ${templateLang}, ${created})`;
    await transactionSql`INSERT INTO whatsapp_connections (user_id, status, updated_at) VALUES (${userId}, 'Mock', ${created})`;
  });

  return userId;
}
