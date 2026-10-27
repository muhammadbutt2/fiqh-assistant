# Three-language search: English, Urdu and Arabic

Updated 27 October 2026. This version of Online Mufti supports exactly three user-facing languages: English (`en`), Urdu (`ur`) and Arabic (`ar`). The earlier twenty-language list has been removed from the registry, the interface, the API and the tests. The books are Arabic and Urdu. English is an input and output language that is bridged into Arabic and Urdu search.

Nothing in this document is a claim that a real book is searchable. See "What is searchable" below.

## Where the languages live

- `src/data/languages.ts` is the single registry: id, native name, direction, font, question placeholder, and whether the language is a *source* language (Arabic, Urdu) or *bridged* (English). `isSupportedLanguage`, `defaultAnswerLocale` and `directionFor` are the only helpers the rest of the code uses.
- `src/data/messages.ts` holds the fixed messages and interface strings for the three languages. Urdu and Arabic drafts are marked `nativeReview: pending`; the English sentence is kept alongside them until a native speaker signs off.
- `GET /api/languages` returns `supported: ["en","ur","ar"]`, `sourceLanguages: ["ar","ur"]` and the locale rows.

## Query flow

The server-side service is `processQuestion` / `processQuestionWithProvider` in `src/server/query.ts`. `answerQuestion` and the admin diagnostic both call it. It returns a structured object validated by `processedQuerySchema` (zod):

| Field | Meaning |
| --- | --- |
| `original` | The question exactly as typed. Never edited. |
| `detectedLanguage`, `detectionConfidence`, `detectionUncertain`, `mixedScript` | From `src/server/detect.ts`. Labels: `ar`, `ur`, `en`, `ur-Latn` (Roman Urdu), `und`. |
| `normalized` | Unicode search normalization (harakat removed, alef/yeh/kaf/heh and digits folded). Used for matching only. |
| `arabicQuery`, `urduQuery` | `{ text, method, model }`. `method` is `source_language` (the question itself), `terminology` (registry terms), `provider` (configured translator) or `none`. |
| `englishIntermediate` | The English question, or the English registry terms for an Urdu/Arabic question. |
| `concepts` | Registry concepts recognised, with their notes and `relatedDistinct` lists. |
| `entities` | Numbers, quantities, conditions, negations and time references found in the question. |
| `ambiguities` | For example "zakat and sadaqah are both mentioned", "validity and obligation are both asked", "language uncertain". |
| `warnings` | For example "the Arabic query is a terminology string, not a translation". |
| `variants` | The ordered retrieval variants: original, normalized, `glossary-ar`, `glossary-ur`, `glossary-en`, and `translation-*` when a provider ran. |

### Example A, English

`Do I have to pay zakat on my savings?` → detected `en`; concepts `zakat`, `intent_obligation`, savings context; Arabic query (terminology) `زكاة المال المدخر زكاة زكاة المال يجب تجب واجب`; Urdu query (terminology) `جمع شدہ مال پر زکوٰۃ زکوٰۃ مال کی زکوٰۃ واجب لازم`. These are search strings. They are not the sentence `هل تجب الزكاة على المال المدخر؟`; that sentence only appears when a translation provider is configured.

### Example B, Urdu

`کیا میرے جمع شدہ پیسوں پر زکوٰۃ واجب ہے؟` → detected `ur` (high confidence, Urdu letters and function words); Urdu query is the normalized question itself (`source_language`); Arabic query is terminology (`زكاة المال المدخر زكاة …`); English intermediate is the registry's English terms.

### Example C, Arabic

`هل تجب الزكاة على المال المدخر؟` → detected `ar`; Arabic query is the question itself; Urdu query is terminology (`جمع شدہ مال پر زکوٰۃ زکوٰۃ …`).

### Fiqh meaning is preserved, not guessed

- The registry in `src/data/glossary.ts` is concept-based. Each concept has `en`, `ar`, `ur`, Arabic and Urdu variants, English expressions, transliterations, optional context phrases, `relatedDistinct` and a note. Sadaqah is never rewritten as zakat; fard, wajib, sunnah, mustahabb, makruh and haram are separate concepts; validity, obligation and permissibility are separate *question intents*.
- Latin forms match whole words only (`riba` does not match `tribal`). Arabic-script forms match after normalization and accept attached prefixes such as `ال`.
- Negations (`not`, `without`, `نہیں`, `بغیر`, `لا`, `لم`, `بلا` …), conditions (`if`, `unless`, `اگر`, `إذا`, `إلا` …), numbers and quantities are extracted and passed to the answer step so they are not dropped. `ما` is not treated as a negation because `ما حكم` is a question form.
- When no registry term is recognised and no provider is configured, the Arabic and Urdu queries are `null` with a warning. Nothing is invented.

## Translation provider

`src/server/ai.ts` has a provider-independent `Translator` and `ChatClient`. `src/server/runtime.ts` wires an OpenAI-compatible endpoint only when `AI_API_KEY` and `AI_CHAT_MODEL` (or `AI_TRANSLATION_MODEL`) are set. Nothing is configured by default, so:

- Query translation: terminology only.
- Answer generation: not run. The reply shows the retrieved excerpt and says no ruling was generated.

Grok's consumer site is not used and not scraped. No paid API is required. Whether a configured endpoint is local, free-tier or paid depends on what you point `AI_BASE_URL` at; document it in your deployment notes. Provider translations are added as extra retrieval variants; they never replace the original question and never bypass the madhhab filter.

## Retrieval

`researchQuestion` in `src/server/research.ts` runs a multi-stage search:

1. Approved evidence (`selectChunks` / `chunkAllowed`): searchable, approved, verified, rights approved, OCR `not_needed` or `acceptable` with a passed accuracy measurement, selected madhhab (or a comparative source labelled for it). A single matching passage is enough to display. Neighbouring PDF pages from the same book are added for context.
2. If none: labelled candidate discovery (`selectCandidateChunks`): unmeasured OCR or pending-review text in the same madhhab. Shown to the user with a warning. Never used to generate a ruling. Calibration thresholds were not lowered.
3. Approved institutional websites (`src/server/websites.ts`): searched only when local approved book evidence is empty, and only for institutions with `retrievalAllowed: true` after an admin live test. Seed records stay disabled. Off-domain and off-path URLs are refused. A search snippet is not evidence. Institutional pages are labelled as such and are not quotations from a classical book. See `docs/website-retrieval.md`.

Semantic embeddings are not configured and `semanticRetrieval` stays `unavailable`.

## Answer language

The answer is written in the selected response language regardless of the question language. If no language is saved, `POST /api/ask` may omit `answerLocale`; the server then uses the detected question language when it is `en`, `ur` or `ar` (Roman Urdu → Urdu), otherwise `DEFAULT_ANSWER_LOCALE` or English. Any other value is rejected with `INVALID_LOCALE`. Direction is set per page (`dir` on the article), per field (textarea follows the selected language) and per quotation (an Arabic excerpt inside an English answer stays RTL).

## What was measured

`tests/cross-language.test.ts` and `tests/query.test.ts` run on synthetic passages. For the zakat-on-savings question in English, Urdu (two phrasings), Roman Urdu and Arabic (two phrasings), both the Hanafi Arabic passage and the Hanafi Urdu passage are in the top 5; the Maliki copy and the unmeasured-OCR copy are excluded; sadaqah is not rewritten as zakat; fard and wajib stay separate. That is terminology retrieval on fixtures. It says nothing about the real books.

`npm run eval:real-book` runs five English/Urdu/Arabic question triplets against the **approved** index only and reports top-5 / top-10 hits. On 27 October 2026 it reported `NOT MEASURABLE`: 0 approved chunks for every madhhab.

## What is searchable

Approved searchable chunks: 0 for all four madhhabs. Unmeasured OCR drafts are stored as labelled candidates: al-Quduri 72 chunks from 36 OCR pages; Bahishti Zewar English 19 chunks from 12 OCR pages; quarantined Minhaj remains unmeasured. Those drafts can appear in an answer as candidate excerpts. They are not approved evidence. See `docs/ocr-ingestion.md`.

## Admin trace

Signed-in admins can POST `/api/admin/diagnose` with `{ "question", "madhhab" }` or use Retrieval trace on `/admin`. It returns the processed query, approved pool size, labelled candidate pool, approved matches, unapproved matches with rejection reasons, neighbouring-page count, and skipped websites.

## Commands

```powershell
npm test
npm run typecheck
npm run lint
npm run eval:real-book
npm run dev
```
