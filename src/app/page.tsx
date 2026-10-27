import { HomeFlow } from "@/components/HomeFlow";
import { TopicGrid } from "@/components/TopicGrid";
import { EXPECTED_WORKS, statusForWork } from "@/data/sources";
import Link from "next/link";

export default function Page() {
  const preview = EXPECTED_WORKS.slice(0, 6);
  return (
    <main>
      <section className="hero wrap">
        <div>
          <p className="eyebrow">Islamic knowledge · Rooted in fiqh</p>
          <h1>Find Clarity in Your <em>Islamic Masail</em>.</h1>
          <p className="lede">Ask your question in your own language — English, Urdu or Arabic. Explore carefully sourced fiqh guidance within your chosen madhhab, with references, explanations, and transparent source information.</p>
          <div className="row">
            <Link className="button" href="/ask">Ask Your Masla</Link>
            <Link className="button secondary" href="#explore">Explore Masail</Link>
          </div>
          <p className="meta">Choose your madhhab · Read cited sources · Understand the evidence</p>
        </div>
        <div className="hero-panel" aria-hidden="true">
          <p className="eyebrow">Design sample · not a ruling</p>
          <p className="arabic" lang="ar" dir="rtl">نموذج للعرض فقط</p>
          <p><strong>Selected madhhab</strong><br />Chosen by you. Not ranked.</p>
          <p className="meta">A real answer appears only after an approved passage is retrieved.</p>
        </div>
      </section>
      <HomeFlow />
      <section className="wrap section" id="explore">
        <h2>Explore Masail by Topic</h2>
        <TopicGrid />
      </section>
      <section className="wrap section steps-row">
        <h2>Clear Answers. Transparent Sources.</h2>
        <ol>
          <li><strong>Choose Your Madhhab</strong><p>Select the fiqh tradition you want the assistant to follow.</p></li>
          <li><strong>Ask in English, Urdu or Arabic</strong><p>Write naturally. The question is turned into Arabic and Urdu search queries for you.</p></li>
          <li><strong>Review the Evidence</strong><p>Explore the answer, cited sources, original excerpts, and any limitations.</p></li>
        </ol>
      </section>
      <section className="wrap section feature-grid">
        <h2>Evidence Matters.</h2>
        <article><h3>Madhhab-Aware Research</h3><p>Retrieval is restricted to your selected madhhab for madhhab-specific rulings.</p></article>
        <article><h3>Cited References</h3><p>Answers link to retrieved sources. Page numbers appear only when the record has them.</p></article>
        <article><h3>English, Urdu and Arabic</h3><p>Ask in any of the three. The books are Arabic and Urdu; the search runs in those languages and the reply comes back in the language you choose.</p></article>
        <article><h3>Honest Uncertainty</h3><p>When evidence is insufficient, the assistant says so. It does not invent a ruling.</p></article>
      </section>
      <section className="wrap section">
        <h2>Explore the Books Behind the Research</h2>
        <p className="meta">These rows come from the source registry. A status of not located, or rights review, means the book is not searchable.</p>
        <ul className="book-list">
          {preview.map((work) => (
            <li key={work.id}>
              <strong>{work.canonicalTitle}</strong>
              <span>{work.author}</span>
              <span>{String(work.madhhab)} · {work.expectedLanguage}</span>
              <span>{statusForWork(work.id).replace(/_/g, " ")}</span>
              <Link href="/sources">Source registry</Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="closing">
        <div className="wrap">
          <h2>Begin with Your Masla</h2>
          <p>Choose your madhhab, ask your question, and explore the available evidence.</p>
          <Link className="button light" href="/ask">Ask Your Masla</Link>
        </div>
      </section>
    </main>
  );
}
