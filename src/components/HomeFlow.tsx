"use client";

import { useMemo, useState } from "react";
import { listLocales } from "@/data/languages";
import { MADHHAB_LABELS, MADHHABS, type Madhhab } from "@/server/madhhab";

const PREFS_KEY = "fiqh.prefs.v1";

export function HomeFlow() {
  const [madhhab, setMadhhab] = useState<Madhhab | null>(null);
  const [query, setQuery] = useState("");
  const [localeId, setLocaleId] = useState<string | null>(null);
  const locales = useMemo(() => listLocales(), []);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return locales;
    return locales.filter((locale) => `${locale.nativeName} ${locale.englishName} ${locale.localeId}`.toLowerCase().includes(needle));
  }, [locales, query]);

  function continueToAsk() {
    if (!madhhab || !localeId) return;
    const locale = locales.find((item) => item.localeId === localeId);
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ madhhab, localeId, direction: locale?.direction, bcp47: locale?.bcp47 }));
    const draft = (document.getElementById("masla") as HTMLTextAreaElement | null)?.value.trim();
    if (draft) window.sessionStorage.setItem("fiqh.draft", draft);
    window.location.href = "/ask";
  }

  return (
    <div className="steps">
      <section aria-labelledby="madhhab-heading">
        <h2 id="madhhab-heading">1. Select a school</h2>
        <p className="meta">One school is required. The schools are not ranked.</p>
        <div className="grid" role="group" aria-label="School of jurisprudence">
          {MADHHABS.map((id) => (
            <button key={id} className="card" type="button" aria-pressed={madhhab === id} onClick={() => setMadhhab(id)}>
              <strong>{MADHHAB_LABELS[id].english}</strong>
              <div className="arabic" lang="ar" dir="rtl">{MADHHAB_LABELS[id].arabic}</div>
              <p>{MADHHAB_LABELS[id].description}</p>
            </button>
          ))}
        </div>
      </section>
      <section id="language" aria-labelledby="language-heading">
        <h2 id="language-heading">2. Select an answer language</h2>
        <p className="meta">The list follows a total-speaker ranking. It is not a judgment about religious importance, and rankings vary.</p>
        <label>
          Search languages
          <input role="combobox" aria-expanded="true" aria-controls="language-list" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Native name or English name" />
        </label>
        <ul id="language-list" className="listbox" role="listbox" aria-label="Answer languages">
          {visible.map((locale) => (
            <li key={locale.localeId}>
              <button type="button" role="option" aria-selected={localeId === locale.localeId} lang={locale.bcp47} dir={locale.direction} onClick={() => setLocaleId(locale.localeId)}>
                <strong>{locale.nativeName}</strong>
                <span className="meta"> {locale.englishName}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section id="ask-panel" aria-labelledby="ask-heading">
        <h2 id="ask-heading">What Would You Like to Know?</h2>
        <p>Write your question naturally. You can ask in your preferred language. The answer language above does not change your madhhab.</p>
        <label htmlFor="masla">Describe your masla here</label>
        <textarea id="masla" dir="auto" placeholder="Describe your masla here..." />
        <p className="meta">Sample suggestions, not rulings.</p>
        <div className="row">
          {["Zakat and savings", "Prayer-related questions", "Fasting and Ramadan"].map((label) => (
            <button key={label} type="button" className="secondary" onClick={() => {
              const box = document.getElementById("masla") as HTMLTextAreaElement | null;
              if (box) box.value = label;
            }}>{label}</button>
          ))}
        </div>
        <button type="button" disabled={!madhhab || !localeId} onClick={continueToAsk}>Find Answer</button>
        <p className="meta">A school and an answer language are required before the question is sent.</p>
      </section>
    </div>
  );
}
