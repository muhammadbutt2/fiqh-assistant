"use client";

import type { PublicAnswer, PublicCitation } from "@/server/types";
import { directionFor, getLocale } from "@/data/languages";
import { uiStrings } from "@/data/messages";

function reference(citation: PublicCitation): string {
  const parts = [citation.title];
  if (citation.author) parts.push(citation.author);
  if (citation.sourceType === "institutional_fatwa" || citation.evidenceRole === "institutional") {
    if (citation.chapter.length > 0) parts.push(citation.chapter.join(" › "));
    if (citation.url) parts.push(citation.url);
    return parts.join(" · ");
  }
  if (citation.volume !== null) parts.push(`vol. ${citation.volume}`);
  if (citation.printedPages) parts.push(citation.printedPages.start === citation.printedPages.end ? `p. ${citation.printedPages.start}` : `pp. ${citation.printedPages.start}–${citation.printedPages.end}`);
  else parts.push(citation.pdfPages.start === citation.pdfPages.end ? `PDF page index ${citation.pdfPages.start}` : `PDF page index ${citation.pdfPages.start}–${citation.pdfPages.end}`);
  if (citation.chapter.length > 0) parts.push(citation.chapter.join(" › "));
  if (citation.edition) parts.push(citation.edition);
  return parts.join(" · ");
}

export function AnswerPanel({ answer, onFeedback }: { answer: PublicAnswer; onFeedback?: (kind: "incorrect_citation" | "incorrect_answer") => void }) {
  const locale = getLocale(answer.preferredAnswerLanguage);
  const direction = locale?.direction ?? "ltr";
  const font = locale?.font === "nastaliq" ? "urdu" : locale?.font === "arabic" ? "arabic" : undefined;
  const strings = uiStrings(answer.preferredAnswerLanguage);
  const summary = answer.querySummary;
  return (
    <article className={`answer ${font ?? ""}`} lang={locale?.bcp47 ?? answer.preferredAnswerLanguage} dir={direction} aria-live="polite">
      <p className="status">{answer.notAMufti ? "This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment." : null}</p>
      <h2>Answer Summary</h2>
      <p className="meta" lang="en" dir="ltr">Searched Arabic and Urdu sources for the selected school. This reply is in your selected language. A quotation stays in the language of the book.</p>
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
      {answer.evidenceRole === "candidate" ? <p className="alert" role="status">The excerpt below was retrieved. It is not approved evidence and is not a ruling.</p> : null}
      {answer.evidenceRole === "institutional" ? <p className="alert" role="status">The excerpt below was retrieved from an approved institutional website. It is not a quotation from a classical fiqh book, and it is not a ruling from this service.</p> : null}
      {answer.citations.length === 0 ? <p>No citation is available.</p> : null}
      {answer.citations.map((citation) => {
        const sourceDir = directionFor(citation.language);
        const sourceFont = citation.language === "ur" ? "urdu" : citation.language === "ar" ? "arabic" : undefined;
        return (
          <section className="citation" key={citation.sourceId}>
            <h3>{citation.title}</h3>
            <p className="meta" lang="en" dir="ltr">{citation.author} · {citation.sourceType} · {citation.verificationStatus} · {citation.evidenceRole}{citation.provenance ? ` · OCR accuracy ${citation.provenance.ocrAccuracy}` : ""}{citation.testFixture ? " · test fixture" : ""}</p>
            {citation.opinionLabels.length > 0 ? <p>Labelled opinions: {citation.opinionLabels.map((item) => `${item.madhhab}: ${item.label}`).join("; ")}</p> : null}
            <details open>
              <summary>{strings.originalExcerpt}</summary>
              <blockquote className={`excerpt ${sourceFont ?? ""}`} dir={sourceDir} lang={citation.language}>
                <p className="excerpt" dir={sourceDir} lang={citation.language}>{citation.originalExcerpt}</p>
              </blockquote>
            </details>
            {citation.translatedExcerpt ? (
              <p><strong>{strings.translation} (supplied with the record, not an AI paraphrase):</strong> {citation.translatedExcerpt}</p>
            ) : <p className="meta" lang="en" dir="ltr">No reviewed translation is stored for this passage. The original text above is the evidence.</p>}
            <p className="meta" lang="en" dir="ltr">
              {strings.references}: {reference(citation)}.
              {citation.printedPages ? "" : " Printed page not recorded; the digital page index is shown instead."}
              {citation.fatwaNumber ? ` Fatwa number: ${citation.fatwaNumber}.` : ""}
            </p>
            {citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">Open original source</a> : <p className="meta" lang="en" dir="ltr">No public link is stored for this source.</p>}
          </section>
        );
      })}
      {answer.uncertainties.length > 0 ? <><h3>Differences or uncertainty</h3><ul>{answer.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
      {answer.limitations.length > 0 ? <><h3>{strings.limitations}</h3><ul lang="en" dir="ltr">{answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
      {summary ? (
        <details lang="en" dir="ltr">
          <summary>How this question was searched</summary>
          <p className="meta">Detected question language: {summary.detectedLanguage} ({summary.detectionConfidence} confidence). Concepts: {summary.concepts.length > 0 ? summary.concepts.join(", ") : "none recognised"}.</p>
          <p className="meta">Arabic search query ({summary.arabicQuery.method}): <span lang="ar" dir="rtl" className="arabic">{summary.arabicQuery.text ?? "—"}</span></p>
          <p className="meta">Urdu search query ({summary.urduQuery.method}): <span lang="ur" dir="rtl" className="urdu">{summary.urduQuery.text ?? "—"}</span></p>
          {summary.negations.length > 0 ? <p className="meta">Negations kept: {summary.negations.join(", ")}</p> : null}
          {summary.conditions.length > 0 ? <p className="meta">Conditions kept: {summary.conditions.join(", ")}</p> : null}
          {summary.numbers.length > 0 ? <p className="meta">Numbers kept: {summary.numbers.join(", ")}</p> : null}
          {summary.ambiguities.length > 0 ? <ul className="meta">{summary.ambiguities.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {summary.warnings.length > 0 ? <ul className="meta">{summary.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </details>
      ) : null}
      <h3>Next steps</h3>
      <p>{answer.humanReviewRecommended ? "A qualified mufti should be consulted. This service has not arranged that review." : "No further step is required by the system."}</p>
      <div className="row">
        <button type="button" className="secondary" onClick={() => { void navigator.clipboard?.writeText(answer.answer); }}>{strings.copyAnswer}</button>
        <button type="button" className="secondary" onClick={() => onFeedback?.("incorrect_citation")}>Report an incorrect citation</button>
        <button type="button" className="secondary" onClick={() => onFeedback?.("incorrect_answer")}>Report an incorrect answer</button>
      </div>
    </article>
  );
}
