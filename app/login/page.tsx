"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(form: FormData) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await response.json();
      setLoading(false);
      if (!response.ok) return setError(data.error || "Something went wrong");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setLoading(false);
      setError("An unexpected error occurred. Please try again.");
    }
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="brand">&lt;/&gt; LeetHabit</div>
        <h1>Welcome back</h1>
        <p>One deliberate problem. Every day.</p>
        <form action={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={loading}>
            {loading ? "Working…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

