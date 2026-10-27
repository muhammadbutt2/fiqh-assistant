"use client";

import type { PublicAnswer } from "@/server/types";
import { getLocale } from "@/data/languages";

export function AnswerPanel({ answer, onFeedback }: { answer: PublicAnswer; onFeedback?: (kind: "incorrect_citation" | "incorrect_answer") => void }) {
  const locale = getLocale(answer.preferredAnswerLanguage);
  const direction = locale?.direction ?? "ltr";
  const font = locale?.font === "nastaliq" ? "urdu" : locale?.font === "arabic" ? "arabic" : undefined;
  return (
    <article className={`answer ${font ?? ""}`} lang={locale?.bcp47 ?? answer.preferredAnswerLanguage} dir={direction} aria-live="polite">
      <p className="status">{answer.notAMufti ? "This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment." : null}</p>
      <h2>Answer</h2>
      <p className="meta">Searched Arabic and Urdu sources for the selected school. This reply is in your selected language. A quotation stays in the language of the book.</p>
      <p>{answer.answer}</p>
      {answer.nativeReview === "pending" && answer.canonicalEnglish ? (
        <details>
          <summary>English wording, kept until native-speaker review</summary>
          <p lang="en" dir="ltr">{answer.canonicalEnglish}</p>
        </details>
      ) : null}
      <h3>School of jurisprudence</h3>
      <p>{answer.madhhab}</p>
      <h3>Evidence</h3>
      <p>{answer.evidenceSummary}</p>
      {answer.citations.length === 0 ? <p>No citation is available.</p> : null}
      {answer.citations.map((citation) => {
        const sourceDir = citation.language === "ar" || citation.language === "ur" || citation.language === "arz" ? "rtl" : "ltr";
        return (
          <section className="citation" key={citation.sourceId}>
            <h3>{citation.title}</h3>
            <p className="meta">{citation.author} · {citation.sourceType} · {citation.verificationStatus}{citation.testFixture ? " · test fixture" : ""}</p>
            {citation.opinionLabels.length > 0 ? <p>Labelled opinions: {citation.opinionLabels.map((item) => `${item.madhhab}: ${item.label}`).join("; ")}</p> : null}
            <details>
              <summary>Original source excerpt</summary>
              <p className="excerpt" dir={sourceDir} lang={citation.language}>{citation.originalExcerpt}</p>
            </details>
            {citation.translatedExcerpt ? (
              <p><strong>Supplied translation, not an AI paraphrase:</strong> {citation.translatedExcerpt}</p>
            ) : <p className="meta">No supplied translation is stored for this passage.</p>}
            <p className="meta">
              Printed pages: {citation.printedPages ? `${citation.printedPages.start}–${citation.printedPages.end}` : "not recorded"}
              . PDF page index: {citation.pdfPages.start}–{citation.pdfPages.end}.
              {citation.fatwaNumber ? ` Fatwa number: ${citation.fatwaNumber}.` : ""}
            </p>
            {citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">Open original source</a> : <button type="button" disabled>No public URL is stored</button>}
          </section>
        );
      })}
      {answer.uncertainties.length > 0 ? <><h3>Differences or uncertainty</h3><ul>{answer.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
      {answer.limitations.length > 0 ? <><h3>Limitations</h3><ul>{answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
      <h3>Next steps</h3>
      <p>{answer.humanReviewRecommended ? "A qualified mufti should be consulted. This service has not arranged that review." : "No further step is required by the system."}</p>
      <div className="row">
        <button type="button" className="secondary" onClick={() => onFeedback?.("incorrect_citation")}>Report an incorrect citation</button>
        <button type="button" className="secondary" onClick={() => onFeedback?.("incorrect_answer")}>Report an incorrect answer</button>
      </div>
    </article>
  );
}
