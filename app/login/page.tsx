"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function Login() {
  const router = useRouter(), [mode, setMode] = useState<"login" | "register">("login"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  async function submit(form: FormData) { setLoading(true); setError(""); const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); const data = await response.json(); setLoading(false); if (!response.ok) return setError(data.error || "Something went wrong"); router.push("/dashboard"); router.refresh(); }
  return <main className="auth"><section className="auth-card"><div className="brand">&lt;/&gt; LeetHabit</div><h1>{mode === "login" ? "Welcome back" : "Start your streak"}</h1><p>One deliberate problem. Every day.</p><form action={submit}><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={loading}>{loading ? "Working…" : mode === "login" ? "Sign in" : "Create account"}</button></form><button className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button></section></main>;
}
