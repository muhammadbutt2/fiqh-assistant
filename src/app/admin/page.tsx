"use client";

import { FormEvent, useEffect, useState } from "react";
import { MADHHABS } from "@/server/madhhab";

type InstitutionRow = {
  id: string;
  officialName: string;
  domain: string;
  homepage: string;
  reviewStatus: string;
  methodologyStatus: string;
  madhhabScope: string[];
  trustedPool: string[];
  pathAllowlist?: string[];
  subjectCoverage?: string[];
  retrievalMethod?: string;
  searchTemplate?: string | null;
  termsReviewStatus?: string;
  retrievalAllowed: boolean;
  lastRetrievalTest?: { at: string; ok: boolean; method: string; sampleUrl: string | null; error: string | null } | null;
  notes: string;
  licenseNotes: string;
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<unknown[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [traceQuestion, setTraceQuestion] = useState("Do I have to pay zakat on my savings?");
  const [traceMadhhab, setTraceMadhhab] = useState("hanafi");
  const [trace, setTrace] = useState<unknown>(null);
  const [testId, setTestId] = useState("mufti-wilayah-persekutuan");
  const [testQuestion, setTestQuestion] = useState("Is wudu required before prayer?");
  const [testMadhhab, setTestMadhhab] = useState("shafii");
  const [testResult, setTestResult] = useState<unknown>(null);
  const [enableNote, setEnableNote] = useState("");
  const [enableMethodology, setEnableMethodology] = useState("");
  const [enableDate, setEnableDate] = useState(new Date().toISOString().slice(0, 10));
  const [enablePool, setEnablePool] = useState("shafii");
  const [enableResult, setEnableResult] = useState<unknown>(null);

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
    const sourceResponse = await fetch("/api/admin/sources");
    const sourcePayload = await sourceResponse.json();
    const rows = (sourcePayload.institutions ?? []) as InstitutionRow[];
    setInstitutions(rows);
    if (!rows.some((item) => item.id === testId) && rows[0]) setTestId(rows[0].id);
  }

  useEffect(() => {
    void refresh();
    // Sign-in and first load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = institutions.find((item) => item.id === testId);

  return (
    <main className="wrap">
      <h1>Admin</h1>
      <p>Statistics come from the store. An empty library stays empty. Marking a source trusted requires a methodology note, a check date, and a reviewer note. Enabling a website also requires a live retrieval test of a real fiqh question. Seed records stay disabled until that action succeeds.</p>
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
            <h2>Website registry</h2>
            <p>New and seed websites stay disabled. Identity-checked is not the same as retrieval enabled. Do not bulk-enable.</p>
            {institutions.map((item) => (
              <article key={item.id} style={{ marginBottom: "1rem" }}>
                <h3>{item.officialName}</h3>
                <p className="meta">{item.domain} · identity {item.reviewStatus} · terms {item.termsReviewStatus ?? "unreviewed"} · method {item.retrievalMethod ?? "none"} · retrieval {item.retrievalAllowed ? "enabled" : "disabled"}</p>
                <p className="meta">Madhhab scope: {(item.madhhabScope ?? []).join(", ") || "none"}. Trusted pool: {(item.trustedPool ?? []).join(", ") || "empty"}. Paths: {(item.pathAllowlist ?? []).join(", ") || "unrestricted after host check"}.</p>
                <p className="meta">Last live test: {item.lastRetrievalTest ? `${item.lastRetrievalTest.ok ? "passed" : "failed"} at ${item.lastRetrievalTest.at}${item.lastRetrievalTest.sampleUrl ? ` · ${item.lastRetrievalTest.sampleUrl}` : ""}${item.lastRetrievalTest.error ? ` · ${item.lastRetrievalTest.error}` : ""}` : "none"}</p>
              </article>
            ))}
          </section>
          <form className="panel" onSubmit={async (event) => {
            event.preventDefault();
            setTestResult({ running: true });
            const response = await fetch("/api/admin/websites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institutionId: testId, question: testQuestion, madhhab: testMadhhab }) });
            setTestResult(await response.json());
            await refresh();
          }}>
            <h2>Website retrieval test</h2>
            <p>Runs the configured method against the live site. A successful test does not enable retrieval. Off-domain URLs are checked and must be rejected.</p>
            <label>Website<select value={testId} onChange={(event) => setTestId(event.target.value)}>{institutions.map((item) => <option key={item.id} value={item.id}>{item.officialName}</option>)}</select></label>
            <label>Test question<textarea value={testQuestion} onChange={(event) => setTestQuestion(event.target.value)} /></label>
            <label>School<select value={testMadhhab} onChange={(event) => setTestMadhhab(event.target.value)}>{MADHHABS.map((id) => <option key={id}>{id}</option>)}</select></label>
            {selected ? <p className="meta">Method {selected.retrievalMethod ?? "none"}. Template {selected.searchTemplate ?? "none"}. Currently {selected.retrievalAllowed ? "enabled" : "disabled"}.</p> : null}
            <button type="submit">Run live retrieval test</button>
            {testResult ? <pre>{JSON.stringify(testResult, null, 2)}</pre> : null}
          </form>
          <form className="panel" onSubmit={async (event) => {
            event.preventDefault();
            const response = await fetch("/api/admin/sources", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: testId,
                trustedPool: [enablePool],
                reviewerNote: enableNote,
                methodology: enableMethodology,
                checkedOn: enableDate,
                testQuestion,
                retrievalAllowed: true,
                termsReviewStatus: "reviewed_query_time_link",
              }),
            });
            setEnableResult(await response.json());
            await refresh();
          }}>
            <h2>Enable one website</h2>
            <p>Enables retrieval for the selected website only, after identity, terms, trusted pool, and a live test of the question above. This does not change other institutions.</p>
            <label>Trusted pool<select value={enablePool} onChange={(event) => setEnablePool(event.target.value)}>{MADHHABS.map((id) => <option key={id}>{id}</option>)}</select></label>
            <label>Check date<input value={enableDate} onChange={(event) => setEnableDate(event.target.value)} /></label>
            <label>Methodology<textarea value={enableMethodology} onChange={(event) => setEnableMethodology(event.target.value)} required /></label>
            <label>Reviewer note<textarea value={enableNote} onChange={(event) => setEnableNote(event.target.value)} required /></label>
            <button type="submit">Verify and enable retrieval</button>
            {enableResult ? <pre>{JSON.stringify(enableResult, null, 2)}</pre> : null}
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
