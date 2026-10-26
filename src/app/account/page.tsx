"use client";

import { FormEvent, useState } from "react";
import { listLocales } from "@/data/languages";
import { MADHHABS } from "@/server/madhhab";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("An account is optional. Anonymous questions stay in this browser.");
  const [madhhab, setMadhhab] = useState("hanafi");
  const [locale, setLocale] = useState("en");

  async function register(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, madhhab, answerLocale: locale }) });
    const payload = await response.json();
    setMessage(response.ok ? "Account created on this server." : payload.error ?? "Account request failed.");
  }

  async function remove() {
    const response = await fetch("/api/account", { method: "DELETE" });
    const payload = await response.json();
    setMessage(response.ok ? "Account data stored on this server was deleted." : payload.error ?? "Could not delete.");
  }

  return (
    <main className="wrap">
      <h1>Account</h1>
      <p role="status">{message}</p>
      <form className="panel" onSubmit={register}>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></label>
        <label>School<select value={madhhab} onChange={(event) => setMadhhab(event.target.value)}>{MADHHABS.map((id) => <option key={id}>{id}</option>)}</select></label>
        <label>Answer language<select value={locale} onChange={(event) => setLocale(event.target.value)}>{listLocales().map((item) => <option key={item.localeId} value={item.localeId}>{item.nativeName}</option>)}</select></label>
        <button type="submit">Create account</button>
      </form>
      <button type="button" className="secondary" onClick={() => void remove()}>Delete account data</button>
    </main>
  );
}
