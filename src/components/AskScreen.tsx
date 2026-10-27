"use client";

import { useEffect, useState } from "react";
import { getLocale, isSupportedLanguage, listLocales, type SupportedLanguage } from "@/data/languages";
import { uiStrings } from "@/data/messages";
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

type LibraryStatus = { libraryPopulated?: boolean; approvedChunks?: number };

export function AskScreen({ ask = defaultAsk }: { ask?: (body: unknown, signal: AbortSignal) => Promise<AskResult> }) {
  const [madhhab, setMadhhab] = useState<Madhhab | null>(null);
  // null means "not chosen yet": the server then answers in the detected question language when it is supported.
  const [localeId, setLocaleId] = useState<SupportedLanguage | null>(null);
  const [question, setQuestion] = useState("");
  const [pendingMadhhab, setPendingMadhhab] = useState<Madhhab | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [library, setLibrary] = useState<string>("The library is not populated. No books or fatwa records have been approved for search.");
  const [controller, setController] = useState<AbortController | null>(null);

  const locale = getLocale(localeId ?? "en");
  const strings = uiStrings(localeId ?? "en");
  const fontClass = locale?.font === "nastaliq" ? "urdu" : locale?.font === "arabic" ? "arabic" : undefined;

  useEffect(() => {
    const saved = window.localStorage.getItem(PREFS_KEY);
    if (saved) {
      const prefs = JSON.parse(saved) as { madhhab?: string; localeId?: string };
      if (prefs.madhhab) setMadhhab(parseMadhhab(prefs.madhhab));
      if (isSupportedLanguage(prefs.localeId)) setLocaleId(prefs.localeId);
    }
    fetch("/api/status").then((response) => response.json()).then((payload: LibraryStatus) => {
      if (payload.libraryPopulated) setLibrary(`Approved material is indexed for the schools that have passed review. Searchable passages: ${payload.approvedChunks ?? "unknown"}.`);
    }).catch(() => setError("The library status could not be loaded."));
    const draft = window.sessionStorage.getItem("fiqh.draft");
    if (draft) {
      setQuestion(draft);
      window.sessionStorage.removeItem("fiqh.draft");
    }
  }, []);

  function persistLocale(next: SupportedLanguage) {
    const saved = window.localStorage.getItem(PREFS_KEY);
    const prefs = saved ? JSON.parse(saved) : {};
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, localeId: next, direction: getLocale(next)?.direction, bcp47: next }));
  }

  async function submit(nextLocale: SupportedLanguage | null = localeId) {
    if (!madhhab || !question.trim()) return;
    const abort = new AbortController();
    setController(abort);
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { madhhab, question };
      if (nextLocale) body.answerLocale = nextLocale;
      if (nextLocale !== localeId && answer?.id) body.previousQuestionId = answer.id;
      const result = await ask(body, abort.signal);
      setAnswer(result);
      if (isSupportedLanguage(result.preferredAnswerLanguage)) {
        setLocaleId(result.preferredAnswerLanguage);
        if (nextLocale) persistLocale(result.preferredAnswerLanguage);
      }
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
      <p>{strings.selectedSchool}: <strong>{madhhab ? MADHHAB_LABELS[madhhab].english : "none yet"}</strong>{localeId ? <> · {strings.answerLanguage}: <strong lang={locale?.bcp47} dir={locale?.direction}>{locale?.nativeName}</strong></> : null}</p>
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
        <select
          aria-label="Answer language"
          value={localeId ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            if (!isSupportedLanguage(next)) return;
            persistLocale(next);
            if (answer) void submit(next);
            else setLocaleId(next);
          }}
        >
          {!localeId ? <option value="">Same as my question (English, Urdu or Arabic)</option> : null}
          {listLocales().map((item) => <option key={item.localeId} value={item.localeId} lang={item.bcp47} dir={item.direction}>{item.nativeName} — {item.englishName}</option>)}
        </select>
      </label>
      <label>
        Question
        <textarea
          aria-label="Question"
          className={fontClass}
          dir={localeId ? locale?.direction : "auto"}
          lang={localeId ? locale?.bcp47 : undefined}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={locale?.questionPlaceholder ?? "Ask in English, Urdu or Arabic. The school, not the language, chooses the sources."}
        />
      </label>
      <div className="row">
        <button type="button" aria-label="Submit" onClick={() => void submit()} disabled={!madhhab || loading || !question.trim()}>{loading ? strings.searching : strings.findAnswer}</button>
        <button type="button" className="secondary" onClick={() => controller?.abort()} disabled={!loading}>{strings.cancel}</button>
        <button type="button" className="secondary" onClick={() => void submit()} disabled={!error && !answer}>{strings.retry}</button>
      </div>
      {loading ? <p role="status">Searching approved passages for the selected madhhab, using the original question and its Arabic and Urdu search variants.</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {!madhhab ? <p role="status">Select a school before asking.</p> : null}
      {answer ? <AnswerPanel answer={answer} onFeedback={(kind) => { void fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answerId: answer.id, kind }) }); }} /> : null}
    </div>
  );
}
