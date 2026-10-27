"use client";

import type { AnswerPresentation, PresentedEvidence, PublicAnswer, PublicCitation } from "@/server/types";
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

function evidenceMeta(item: PresentedEvidence): string {
  const parts: string[] = [];
  if (item.author) parts.push(item.author);
  if (item.kind === "book") {
    if (item.edition) parts.push(item.edition);
    if (item.volume !== null) parts.push(`vol. ${item.volume}`);
    if (item.printedPages) parts.push(item.printedPages.start === item.printedPages.end ? `p. ${item.printedPages.start}` : `pp. ${item.printedPages.start}–${item.printedPages.end}`);
    else if (item.pdfPages) parts.push(item.pdfPages.start === item.pdfPages.end ? `PDF page index ${item.pdfPages.start}` : `PDF page index ${item.pdfPages.start}–${item.pdfPages.end}`);
  } else {
    if (item.publishedAt) parts.push(`Published ${item.publishedAt}`);
    if (item.retrievedAt) parts.push(`Retrieved ${item.retrievedAt}`);
  }
  return parts.join(" · ");
}

function EvidenceCard({ item, originalLabel, translationFallback }: { item: PresentedEvidence; originalLabel: string; translationFallback: string }) {
  const sourceDir = directionFor(item.excerptLanguage);
  const sourceFont = item.excerptLanguage === "ur" ? "urdu" : item.excerptLanguage === "ar" ? "arabic" : undefined;
  const heading = item.kind === "website" ? (item.articleTitle ?? item.title) : item.title;
  return (
    <section className="citation">
      <h3>
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{heading}</a> : heading}
      </h3>
      <p className="meta" lang="en" dir="ltr">{evidenceMeta(item)}</p>
      <details open>
        <summary>{originalLabel}</summary>
        <blockquote className={`excerpt ${sourceFont ?? ""}`} dir={sourceDir} lang={item.excerptLanguage}>
          <p className="excerpt" dir={sourceDir} lang={item.excerptLanguage}>{item.originalExcerpt}</p>
        </blockquote>
      </details>
      {item.translation ? (
        <p><strong>{item.translationLabel}:</strong> {item.translation}</p>
      ) : <p className="meta" lang="en" dir="ltr">{translationFallback}</p>}
      {item.relevance ? <p className="meta">{item.relevance}</p> : null}
    </section>
  );
}

function PresentationView({ presentation, answer }: { presentation: AnswerPresentation; answer: PublicAnswer }) {
  const strings = uiStrings(answer.preferredAnswerLanguage);
  const locale = getLocale(answer.preferredAnswerLanguage);
  return (
    <>
      <header className="answer-header">
        <h2>{presentation.questionTitle}</h2>
        <dl className="answer-meta">
          <div><dt>{strings.selectedSchool}</dt><dd>{presentation.madhhabLabel}</dd></div>
          <div><dt>{strings.answerLanguage}</dt><dd>{presentation.answerLanguageLabel}</dd></div>
          <div><dt>{strings.coverageLabel}</dt><dd>{presentation.coverageStatus}</dd></div>
        </dl>
      </header>
      <section className="answer-section">
        <h3>{strings.answerHeading}</h3>
        <p>{presentation.directAnswer}</p>
      </section>
      {locale?.localeId !== "en" && answer.nativeReview === "pending" && answer.canonicalEnglish && answer.answerStatus === "insufficient_evidence" ? (
        <details>
          <summary>English wording, kept until native-speaker review</summary>
          <p lang="en" dir="ltr">{answer.canonicalEnglish}</p>
        </details>
      ) : null}
      {presentation.explanation ? (
        <section className="answer-section">
          <h3>{strings.explanationHeading}</h3>
          <p>{presentation.explanation}</p>
        </section>
      ) : null}
      {presentation.bookEvidence.length > 0 ? (
        <section className="answer-section">
          <h3>{strings.bookEvidenceHeading}</h3>
          {presentation.bookEvidence.map((item) => (
            <EvidenceCard key={item.sourceId} item={item} originalLabel={strings.originalExcerpt} translationFallback={strings.noTranslation} />
          ))}
        </section>
      ) : null}
      {presentation.websiteEvidence.length > 0 ? (
        <section className="answer-section">
          <h3>{strings.websiteEvidenceHeading}</h3>
          {presentation.websiteEvidence.map((item) => (
            <EvidenceCard key={item.sourceId} item={item} originalLabel={strings.originalExcerpt} translationFallback={strings.noTranslation} />
          ))}
        </section>
      ) : null}
      {presentation.conditions.length > 0 ? (
        <section className="answer-section">
          <h3>{strings.conditionsHeading}</h3>
          <ul>{presentation.conditions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {presentation.disagreements.length > 0 ? (
        <section className="answer-section">
          <h3>{strings.differencesHeading}</h3>
          <ul>{presentation.disagreements.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {presentation.sources.length > 0 ? (
        <section className="answer-section">
          <h3>{strings.sourcesHeading}</h3>
          <ol className="source-list">
            {presentation.sources.map((item) => (
              <li key={item.sourceId}>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.n}. {item.label}</a> : <span>{item.n}. {item.label}</span>}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {presentation.furtherReview ? (
        <section className="answer-section">
          <h3>{strings.furtherReviewHeading}</h3>
          <p>{presentation.furtherReview}</p>
        </section>
      ) : null}
      {answer.limitations.length > 0 && presentation.furtherReview !== answer.limitations.join(" ") ? (
        <section className="answer-section">
          <h3>{strings.limitations}</h3>
          <ul lang="en" dir="ltr">{answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
    </>
  );
}

export function AnswerPanel({ answer, onFeedback }: { answer: PublicAnswer; onFeedback?: (kind: "incorrect_citation" | "incorrect_answer") => void }) {
  const locale = getLocale(answer.preferredAnswerLanguage);
  const direction = locale?.direction ?? "ltr";
  const font = locale?.font === "nastaliq" ? "urdu" : locale?.font === "arabic" ? "arabic" : undefined;
  const strings = uiStrings(answer.preferredAnswerLanguage);
  const presentation = answer.presentation;
  return (
    <article className={`answer ${font ?? ""}`} lang={locale?.bcp47 ?? answer.preferredAnswerLanguage} dir={direction} aria-live="polite">
      <p className="status">{answer.notAMufti ? "This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment." : null}</p>
      {presentation ? (
        <PresentationView presentation={presentation} answer={answer} />
      ) : (
        <>
          <h2>{strings.answerHeading}</h2>
          <p>{answer.answer}</p>
          {answer.nativeReview === "pending" && answer.canonicalEnglish ? (
            <details>
              <summary>English wording, kept until native-speaker review</summary>
              <p lang="en" dir="ltr">{answer.canonicalEnglish}</p>
            </details>
          ) : null}
          <h3>{strings.selectedSchool}</h3>
          <p>{answer.madhhab}</p>
          {answer.citations.map((citation) => {
            const sourceDir = directionFor(citation.language);
            const sourceFont = citation.language === "ur" ? "urdu" : citation.language === "ar" ? "arabic" : undefined;
            return (
              <section className="citation" key={citation.sourceId}>
                <h3>{citation.title}</h3>
                <p className="meta" lang="en" dir="ltr">{reference(citation)}</p>
                <blockquote className={`excerpt ${sourceFont ?? ""}`} dir={sourceDir} lang={citation.language}>
                  <p className="excerpt" dir={sourceDir} lang={citation.language}>{citation.originalExcerpt}</p>
                </blockquote>
                {citation.translatedExcerpt ? <p><strong>{strings.translation}:</strong> {citation.translatedExcerpt}</p> : <p className="meta" lang="en" dir="ltr">{strings.noTranslation}</p>}
                {citation.printedPages ? null : <p className="meta" lang="en" dir="ltr">Printed page not recorded; the digital page index is shown instead.</p>}
              </section>
            );
          })}
        </>
      )}
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
