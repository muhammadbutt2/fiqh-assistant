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
      <section aria-labelledby="language-heading">
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
      <section>
        <h2>3. Ask</h2>
        <p>The question box opens after both choices. You can change them later.</p>
        <button type="button" disabled={!madhhab || !localeId} onClick={continueToAsk}>Continue</button>
      </section>
    </div>
  );
}
