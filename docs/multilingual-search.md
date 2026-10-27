# Multilingual search and Online Mufti interface

Written 27 October 2026. This is what the app does now. It is not a claim that every language retrieves the real books well.

## Query flow

1. The original question is stored unchanged.
2. `detectLanguage` estimates the language and script, including Arabic versus Urdu when Urdu-specific letters are present, Roman Urdu, Devanagari, Bengali, Han, kana, and Cyrillic. Latin questions use a small word list for English, Spanish, and French. Uncertain detection still runs the search.
3. `buildVariants` always keeps the original and a normalized copy. If a term in `src/data/glossary.ts` matches, it adds an Arabic query and an Urdu query made of those terms and their search phrases. A zakat question that also mentions savings adds the search phrases `زكاة المال المدخر` and `جمع شدہ مال پر زکوٰۃ`. Those phrases are terminology, not a ruling and not a full-sentence translation.
4. If `TRANSLATION` provider credentials are configured, `answerQuestion` also adds provider translations into Arabic and Urdu. The default install has no provider, so this step does not run.
5. `selectChunks` searches approved chunks for the selected madhhab with lexical overlap. Arabic and Urdu variants are weighted slightly higher. Madhhab, rights, verification, and OCR gates are unchanged. Unmeasured OCR cannot be cited.
6. Semantic embeddings are not configured. `semanticRetrieval` stays `unavailable`. No vector index was mixed in.
7. With no chat model, the reply shows the retrieved excerpt and says a ruling was not generated. With a configured model, the old citation checks still apply. The answer language is the user's selected locale and is independent of the question language.

Changing language does not change the madhhab. A school change still clears the current answer.

## What was measured

`tests/cross-language.test.ts` uses one synthetic Hanafi passage and the same text labelled Maliki. It is not a real book.

For the same zakat-on-savings question in English, Urdu script, Roman Urdu, Arabic, Spanish, French, Turkish, Chinese, Hindi, and Bengali, the Hanafi passage was in the top 5. The Maliki copy and an unmeasured-OCR copy were excluded. Sadaqah was not rewritten as zakat.

That is terminology retrieval on a fixture. It is not evidence of embedding quality, and it was not run on al-Quduri, al-Hidayah, al-Fatawa al-Hindiyyah, or Bahishti Zewar.

## What is searchable

No local book is searchable. OCR of al-Quduri (12 pages) and Bahishti Zewar (8 page-runs) is still unmeasured. The Minhaj archive.org text remains quarantined. Approved searchable chunks: 0.

## Languages

The interface list is still the existing 20-language registry (21 locales, because Chinese has two scripts). Per-language limits are on `/methodology`, from `src/data/retrieval-support.ts`.

Whole-sentence translation into Arabic and Urdu needs an optional server provider. Until then, only listed terms cross languages. Japanese has script detection and no terminology. Turkish is not an answer language; a Turkish question can still match `zekât`.

## Admin trace

Signed-in admins can POST `/api/admin/diagnose` with `{ "question", "madhhab" }`, or use Retrieval trace on `/admin`. It shows detection, the Arabic query, the Urdu query, methods, and candidate scores. Ordinary users do not get this route.

## Interface

The public pages use the Online Mufti name, the emerald and ivory palette, a simple arch-and-book mark, and pages for methodology, privacy, and terms. Madhhab choice is still required. Sample topic buttons only fill the question box. They are labelled as samples, not rulings. Book rows on the home page use the registry status, which is rights review or not located.

## Commands

```powershell
npm test
npm run typecheck
npm run dev
```

Open `http://localhost:3000`. Admin diagnosis needs `AUTH_SECRET` and `ADMIN_PASSWORD`.

## Not done, on purpose

The remaining pages of the local PDFs were not OCR'd in this pass. OCR output still cannot be cited until human references exist and calibration passes. No embedding model was added, because none is configured and a silent model change would need its own index. No paid API was turned on.
