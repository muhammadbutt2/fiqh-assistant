"use client";

import { FormEvent, useEffect, useState } from "react";
import { MADHHABS } from "@/server/madhhab";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<unknown[]>([]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "UNAUTHENTICATED");
      return;
    }
    await refresh();
  }

  async function refresh() {
    const response = await fetch("/api/admin/stats");
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "UNAUTHENTICATED");
      setStats(null);
      return;
    }
    setStats(payload);
    const jobResponse = await fetch("/api/admin/jobs");
    const jobPayload = await jobResponse.json();
    setJobs(jobPayload.jobs ?? []);
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <main className="wrap">
      <h1>Admin</h1>
      <p>Statistics come from the store. An empty library stays empty. Marking a source trusted requires a methodology note, a check date, and a reviewer note.</p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {!stats ? (
        <form onSubmit={login} className="panel">
          <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <button type="submit">Sign in</button>
        </form>
      ) : (
        <>
          <pre className="panel">{JSON.stringify(stats, null, 2)}</pre>
          <form className="panel" action="/api/admin/documents" method="post" encType="multipart/form-data">
            <h2>Upload</h2>
            <p>Uploads are not searchable until rights and verification are approved.</p>
            <label>File<input name="file" type="file" required /></label>
            <label>Title<input name="title" required /></label>
            <label>Author<input name="author" /></label>
            <label>School<select name="madhhab">{MADHHABS.map((id) => <option key={id}>{id}</option>)}</select></label>
            <label>Source class<select name="sourceClass"><option>primary</option><option>institutional_fatwa</option><option>secondary</option><option>comparative</option></select></label>
            <label>Language<input name="language" defaultValue="ar" /></label>
            <button type="submit">Upload for review</button>
          </form>
          <section className="panel">
            <h2>Jobs</h2>
            <pre>{JSON.stringify(jobs, null, 2)}</pre>
          </section>
        </>
      )}
    </main>
  );
}
