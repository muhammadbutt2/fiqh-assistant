"use client";

import { useEffect, useState } from "react";
import { listLocales } from "@/data/languages";
import { AnswerPanel } from "@/components/AnswerPanel";
import { MADHHAB_LABELS, MADHHABS, parseMadhhab, type Madhhab } from "@/server/madhhab";
import type { PublicAnswer } from "@/server/types";

const PREFS_KEY = "fiqh.prefs.v1";

type AskResult = PublicAnswer & { id?: string };

async function defaultAsk(body: unknown, signal: AbortSignal): Promise<AskResult> {
  const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED");
  return payload as AskResult;
}

export function AskScreen({ ask = defaultAsk }: { ask?: (body: unknown, signal: AbortSignal) => Promise<AskResult> }) {
  const [madhhab, setMadhhab] = useState<Madhhab | null>(null);
  const [localeId, setLocaleId] = useState("en");
  const [question, setQuestion] = useState("");
  const [pendingMadhhab, setPendingMadhhab] = useState<Madhhab | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [library, setLibrary] = useState<string>("The library is not populated. No books or fatwa records have been approved for search.");
  const [controller, setController] = useState<AbortController | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(PREFS_KEY);
    if (saved) {
      const prefs = JSON.parse(saved) as { madhhab?: string; localeId?: string };
      if (prefs.madhhab) setMadhhab(parseMadhhab(prefs.madhhab));
      if (prefs.localeId) setLocaleId(prefs.localeId);
    }
    fetch("/api/status").then((response) => response.json()).then((payload: { libraryPopulated?: boolean }) => {
      if (payload.libraryPopulated) setLibrary("Approved material is indexed for the schools that have passed review.");
    }).catch(() => setError("The library status could not be loaded."));
  }, []);

  async function submit(nextLocale = localeId) {
    if (!madhhab || !question.trim()) return;
    const abort = new AbortController();
    setController(abort);
    setLoading(true);
    setError(null);
    try {
      const result = await ask({ madhhab, answerLocale: nextLocale, question, previousQuestionId: nextLocale === localeId ? undefined : answer?.id }, abort.signal);
      setAnswer(result);
      setLocaleId(nextLocale);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") setError("Cancelled. Your question is still in the box.");
      else setError(caught instanceof Error ? caught.message : "The request failed. Your question is still in the box.");
    } finally {
      setLoading(false);
      setController(null);
    }
  }

  function confirmMadhhab() {
    if (!pendingMadhhab) return;
    setMadhhab(pendingMadhhab);
    setAnswer(null);
    const saved = window.localStorage.getItem(PREFS_KEY);
    const prefs = saved ? JSON.parse(saved) : {};
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, madhhab: pendingMadhhab }));
    setPendingMadhhab(null);
  }

  return (
    <div className="steps">
      <p className="status" role="status">{library}</p>
      <p>Selected school: <strong>{madhhab ? MADHHAB_LABELS[madhhab].english : "none yet"}</strong></p>
      <div className="row" role="group" aria-label="Change school">
        {MADHHABS.map((id) => (
          <button key={id} type="button" className="secondary" aria-pressed={madhhab === id} onClick={() => setPendingMadhhab(id)}>{MADHHAB_LABELS[id].english}</button>
        ))}
      </div>
      {pendingMadhhab && pendingMadhhab !== madhhab ? (
        <dialog open aria-labelledby="change-title">
          <h2 id="change-title">Change school?</h2>
          <p>Changing school clears the current answer and searches a different source pool.</p>
          <div className="row">
            <button type="button" onClick={confirmMadhhab}>Confirm change</button>
            <button type="button" className="secondary" onClick={() => setPendingMadhhab(null)}>Keep current school</button>
          </div>
        </dialog>
      ) : null}
      <label>
        Answer language
        <select aria-label="Answer language" value={localeId} onChange={(event) => { const next = event.target.value; if (answer) void submit(next); else setLocaleId(next); }}>
          {listLocales().map((locale) => <option key={locale.localeId} value={locale.localeId}>{locale.nativeName} — {locale.englishName}</option>)}
        </select>
      </label>
      <label>
        Question
        <textarea aria-label="Question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask in any language you write. The school, not the language, chooses the sources." />
      </label>
      <div className="row">
        <button type="button" onClick={() => void submit()} disabled={!madhhab || loading || !question.trim()}>{loading ? "Searching" : "Submit"}</button>
        <button type="button" className="secondary" onClick={() => controller?.abort()} disabled={!loading}>Cancel</button>
        <button type="button" className="secondary" onClick={() => void submit()} disabled={!error && !answer}>Retry</button>
      </div>
      {loading ? <p role="status">Searching approved sources for the selected school.</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {!madhhab ? <p role="status">Select a school before asking.</p> : null}
      {answer ? <AnswerPanel answer={answer} onFeedback={(kind) => { void fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answerId: answer.id, kind }) }); }} /> : null}
    </div>
  );
}
