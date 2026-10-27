"use client";

import { FormEvent, useEffect, useState } from "react";
import { MADHHABS } from "@/server/madhhab";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<unknown[]>([]);
  const [traceQuestion, setTraceQuestion] = useState("Do I have to pay zakat on my savings?");
  const [traceMadhhab, setTraceMadhhab] = useState("hanafi");
  const [trace, setTrace] = useState<unknown>(null);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error === "ADMIN_NOT_CONFIGURED" ? "Admin sign-in is turned off until ADMIN_PASSWORD is set in .env and the server is restarted." : payload.error ?? "UNAUTHENTICATED");
      return;
    }
    await refresh();
  }

  async function refresh() {
    const response = await fetch("/api/admin/stats");
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error === "ADMIN_NOT_CONFIGURED" ? "Admin sign-in is turned off until ADMIN_PASSWORD is set in .env and the server is restarted." : payload.error ?? "UNAUTHENTICATED");
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
          <form className="panel" onSubmit={async (event) => {
            event.preventDefault();
            const response = await fetch("/api/admin/diagnose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: traceQuestion, madhhab: traceMadhhab }) });
            setTrace(await response.json());
          }}>
            <h2>Retrieval trace</h2>
            <p>Admin only. Shows detection, Arabic and Urdu queries, approved matches, labelled candidate matches, and skipped websites. It does not publish anything.</p>
            <label>Question<textarea value={traceQuestion} onChange={(event) => setTraceQuestion(event.target.value)} /></label>
            <label>School<select value={traceMadhhab} onChange={(event) => setTraceMadhhab(event.target.value)}>{MADHHABS.map((id) => <option key={id}>{id}</option>)}</select></label>
            <button type="submit">Run trace</button>
            {trace ? <pre>{JSON.stringify(trace, null, 2)}</pre> : null}
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
