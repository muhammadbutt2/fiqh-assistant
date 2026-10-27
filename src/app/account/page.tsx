"use client";

import { FormEvent, useState } from "react";
import { listLocales } from "@/data/languages";
import { MADHHABS } from "@/server/madhhab";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("An account is optional. Anonymous questions stay in this browser. A password needs at least 10 characters.");
  const [madhhab, setMadhhab] = useState("hanafi");
  const [locale, setLocale] = useState("en");

  function explain(code: string | undefined, fallback: string) {
    if (code === "AUTH_NOT_CONFIGURED") return "Account sign-in is not available on this server yet.";
    if (code === "INVALID_REQUEST") return "Use a valid email and a password of at least 10 characters.";
    if (code === "EMAIL_IN_USE") return "That email is already registered. Sign in instead.";
    if (code === "UNAUTHENTICATED") return "Email or password did not match, or you are not signed in.";
    return code ?? fallback;
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setMessage("Creating the account…");
    const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, madhhab, answerLocale: locale }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Account created. You are signed in on this browser." : explain(payload.error, "Account request failed."));
  }

  async function signIn() {
    setMessage("Signing in…");
    const response = await fetch("/api/account", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Signed in on this browser." : explain(payload.error, "Sign-in failed."));
  }

  async function remove() {
    setMessage("Deleting account data…");
    const response = await fetch("/api/account", { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Account data stored on this server was deleted." : explain(payload.error, "Could not delete."));
  }

  return (
    <main className="wrap">
      <h1>Account</h1>
      <p className="status" role="status">{message}</p>
      <form className="panel" onSubmit={register}>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></label>
        <label>School<select value={madhhab} onChange={(event) => setMadhhab(event.target.value)}>{MADHHABS.map((id) => <option key={id}>{id}</option>)}</select></label>
        <label>Answer language<select value={locale} onChange={(event) => setLocale(event.target.value)}>{listLocales().map((item) => <option key={item.localeId} value={item.localeId}>{item.nativeName}</option>)}</select></label>
        <div className="row">
          <button type="submit">Create account</button>
          <button type="button" className="secondary" onClick={() => void signIn()}>Sign in</button>
        </div>
      </form>
      <button type="button" className="secondary" onClick={() => void remove()}>Delete account data</button>
    </main>
  );
}
