# Implementation report

Date: 26 October 2026. Local project: `C:\Users\muham\fiqh-assistant`. Public repository: `https://github.com/muhammadbutt2/fiqh-assistant`.

The app is an AI-assisted research service for four Sunni schools: Hanafi, Maliki, Shafi'i, and Hanbali. It is not a mufti. The landing heading is "AI Islamic Fiqh Assistant" and the description is "Ask Islamic jurisprudence questions and explore source-supported answers according to your selected Sunni school of thought."

## What was built

- Next.js 15 App Router, React 19, TypeScript, Tailwind 4. Pages: home, ask, sources, account, admin. Security headers and a content security policy are set in `next.config.ts`.
- School choice is required before a question is stored in the browser. Changing school clears the current answer. Answer language is a separate control. Twenty languages, twenty-one locales, from the Wikipedia "Ethnologue (2026)" table retrieved on 26 October 2026. Displayed millions are used. Turkish is the next row at the same displayed total as Hausa and is excluded because Wikipedia lists Hausa first. Punjabi and Tamil are outside this top 20. A direct request to the Ethnologue insights URL returned HTTP 403, so the subscriber dataset was not opened.
- Arabic, Urdu, and Egyptian Arabic are RTL. Other listed locales are LTR. Non-English fixed strings are marked pending native-speaker review, and the English no-evidence sentence is kept beside them.
- Retrieval is lexical on normalized text, with glossary forms for terms such as salah, tashahhud, and wudu. Semantic retrieval is reported as `unavailable`. No embedding is invented. pgvector is in Docker Compose and in `prisma/sql/search.sql`, without a vector column, because no model dimension is known.
- The selected school is a hard filter. Comparative passages need opinion labels and must list that school. Unapproved, unverified, rights-restricted, poor or uncertain OCR, condition-obscuring translations, and test fixtures are excluded from production search.
- Without an API key the status is never `answered`. An empty index returns the English sentence: "We could not locate a sufficiently reliable source for this question in the currently indexed material for your selected madhhab. We do not want to guess or present an unsupported religious ruling. Please consult a qualified mufti." If passages exist but no model is configured, the status is `human_review_required` and the excerpts are slices of the index, not a fatwa from this service.
- A configured model is accepted only when the school matches, every excerpt is an exact substring, and page, fatwa number, and URL claims match the stored passage. A school switch or a failed check drops the generated text. High-stakes questions and disagreeing passages stay `human_review_required` and keep the retrieved passages. The response says no review has taken place.
- Ingestion accepts PDF, EPUB, HTML, and text after magic-byte checks. Printed pages stay null. Image-only PDFs are judged page by page. Pages that need OCR go through the separate OCR pipeline (see the 2026-10-27 update below) and never become searchable on the legacy upload path.
- Accounts use scrypt passwords and an HMAC cookie. If `AUTH_SECRET` is empty, a random secret is stored in `.data/auth-secret` so local registration works. Admin routes return 503 until `ADMIN_PASSWORD` is set. Uploads cannot mark themselves searchable. Audit rows store the question hash, not the question text.
- Default store is `.data/store.json`. `DATABASE_URL` switches to Prisma. The migration SQL is in the repo. It was not applied: the Docker engine was not running.

## What was tested

On 26 October 2026, after the fixes those runs required:

- `npm test`: 34 tests passed. Coverage includes the four schools and rejection of Ja'fari, the speaker table, a no-evidence string for every locale, Roman Urdu detection of "Main namaz mein doosri rakat mein tashahhud bhool gaya. Kya karun?", madhhab isolation, exclusion of bad rights / OCR / trust / fixtures, comparative labels, citation rejection, prompt injection that must not reveal a key or switch school, empty corpus, disagreement, talaq human review, language change without a source change, the ten cross-lingual cases, Hausa fallback, upload traversal and type checks, the OCR failure, and admin 401/503.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed (Next.js 15.5.28). Static pages include `/`, `/ask`, `/sources`, `/account`, and `/admin`. Ask and admin APIs are dynamic.
- UI tests render the landing copy, language direction, and the ask error state in happy-dom. A desktop or mobile browser was not available, so those viewports were not clicked.
- `npm run inventory:books` read the local PDF info dictionaries. Page text was not printed and was not committed.
- `npm run db:seed` was not applied. Without `DATABASE_URL` it is written to exit non-zero.

## Still blocked

- No chat, embedding, or translation API key. Generated rulings and semantic search stay off.
- Native-speaker review of every non-English fixed string is pending. Machine translation is `not_validated` or `insufficient` except English, which needs no translation.
- Tesseract 5.4 is now installed, but no OCR output has a measured accuracy. See the 2026-10-27 update below.
- Docker was installed but the daemon was not running, so Postgres, migrate, seed, and `search.sql` were not applied.
- Every checked institution has an empty trusted pool and `retrievalAllowed: false`.
- Local PDFs are quarantined. Rights were not cleared. Filename digits on the Hidayah set do not match the volume numbers in the PDF info dictionary.
- `npm audit` reported vulnerabilities when dependencies were installed. `npm audit fix --force` was not run.
- No browser pass beyond happy-dom.

Prompt and answer-generation version: `2026-10-26.1`.

## Update 2026-10-27: OCR and book-ingestion pipeline

Full usage is in `docs/ocr-ingestion.md`. The book lists are in `docs/missing-book-manifest.md`.

What changed:

- New `src/server/ocr/` modules: Tesseract discovery and Windows paths with named errors, per-page embedded-text assessment, rendering through `pdfjs-dist` (the bundled pdf.js could not decode JBIG2 scans), checkpointed resumable page pipeline, CER/WER/critical-token calibration, and page-level indexing with per-chunk provenance.
- New commands: `ocr:doctor`, `ingest:pilot`, `ingest:full`, `ocr:calibrate`, `ocr:index`, `ingest:open-text`.
- Gates tightened, not relaxed. `applyReview` previously accepted `ocrStatus` values `pending` and `engine_present_unmeasured` as searchable, and `chunkAllowed` accepted `ocrQuality` `unmeasured`. Both are now closed. Only `not_needed`, `measured_acceptable` and `measured_partial` documents, and `not_needed` or `acceptable` chunks, can be searched.
- The Minhaj al-Talibin archive.org OCR text (868 chunks) was searchable with unmeasured accuracy. It is now quarantined. The store has 0 searchable documents and 0 searchable chunks.

Verified on this machine on 27 October 2026:

- `npm test`: 98 tests passed in 7 files (36 existing plus 62 new for engine and config, pipeline, calibration and indexing). The new tests use a fake OCR engine, so they check the pipeline, gates and bookkeeping. They do not measure Tesseract accuracy.
- `npm run typecheck` and `npm run lint` passed.
- `npm run ocr:doctor`: Tesseract 5.4.0.20240606, `ara`, `urd`, `eng`, `osd` present in `.data/tessdata`. A real scan page rendered, and a one-page `ara` OCR smoke test returned 1724 characters at confidence 81.4. 15 distinct PDFs: 14 scanned, 1 with an unusable text layer.
- Pilots: al-qaduri 12 pages OCR'd and resumed from checkpoint without re-running. Bahishti Zewar 4 pages under two language settings, all below the confidence screen.
- `ocr:calibrate -- select` and `evaluate` on al-qaduri produced verdict `unmeasured` (0 reliable references, 8 sample pages missing references). `ocr:index -- book --book al-qaduri` stored 0 chunks and left the document non-searchable.

Counts: extracted 12 pages of al-qaduri and 8 page-runs of Bahishti Zewar. Evaluated 0. Approved 0. Indexed 0. The corpus is not ready.

Not verified: OCR accuracy for any book, rotation detection on real rotated pages, a full-book OCR run, and a browser pass on the ask page after the change.

## Update 2026-10-27 (later): English, Urdu and Arabic only

Full detail is in `docs/multilingual-search.md`.

Files changed:

- `src/data/languages.ts` rewritten: three languages (`en`, `ur`, `ar`), direction, font, native placeholder, source/bridged role, `isSupportedLanguage`, `defaultAnswerLocale`, `directionFor`. The Ethnologue ranking and the other 17 languages are gone.
- `src/data/messages.ts`: messages and interface strings for the three languages only; `getCopy` rejects anything else.
- `src/data/glossary.ts` rewritten as a concept registry (en/ar/ur canonical terms, variants, transliterations, context phrases, `relatedDistinct`, notes) covering zakat, sadaqah, sadaqat al-fitr, nisab, hawl, salah, dua, tashahhud, rak'ah, sajdat al-sahw, wudu, ghusl, tayammum, taharah, sawm, qada, kaffarah, fidyah, hajj, umrah, nikah, mahr, wali, talaq, khula, faskh, iddah, riba, qard, dayn, bay', ijarah, mirath, wasiyyah, yamin, nadhr, halal, haram, fard, wajib, sunnah, mustahabb, makruh, mubah, sahih, batil, and three question intents (obligation, validity, permissibility). Latin forms match whole words; Arabic-script forms match after normalization.
- New `src/server/normalize.ts`, `src/server/detect.ts` (three-language detection with confidence, Roman Urdu, negation words, high-stakes patterns) and `src/server/query.ts` (`processQuestion`, `processQuestionWithProvider`, `processedQuerySchema`). `src/server/text.ts` is now a facade.
- `src/server/answer.ts` uses the query service, re-checks the madhhab after selection, passes negations/conditions/numbers/concepts to the model, carries a response-language instruction per language, and returns `querySummary`. Prompt and generation version `2026-10-27.1`.
- `src/server/handlers.ts`: `answerLocale` optional; defaults to the detected question language when supported, else `DEFAULT_ANSWER_LOCALE`/English; any other value is `INVALID_LOCALE`.
- `src/server/diagnose.ts`: full processed query, approved pool size and held-back candidate count.
- UI: `HomeFlow` shows three language cards and switches the question box direction and placeholder; `AskScreen` offers the three languages plus "same as my question", RTL for Urdu/Arabic, native button labels; `AnswerPanel` labels translations, shows printed page or a clearly labelled PDF page index, keeps Arabic/Urdu quotations RTL inside an English answer, and has a "How this question was searched" panel; `SiteChrome` header shows the selected school and language. `/methodology`, `/api/languages`, `src/data/retrieval-support.ts` updated.
- Tests: `tests/registry.test.ts`, `tests/ui.test.tsx`, `tests/cross-language.test.ts`, `tests/answers.test.ts` rewritten for three languages; new `tests/query.test.ts`.
- New `scripts/eval-real-book.ts` (`npm run eval:real-book`): English/Urdu/Arabic triplets against the approved index only, top-5 / top-10 report.
- Docs and `.env.example` updated.

Verified on this machine on 27 October 2026:

- `npm test`: 124 tests passed in 9 files.
- `npm run typecheck` and `npm run lint`: clean.
- `npm run ingest:pilot -- --book al-qaduri --limit 24`: 24 more pages OCR'd (36 total), 0 failed. `ocr:calibrate -- select --with-draft`: 12 sample pages chosen (16, 38, 48, 59, 75, 91, 96, 117, 133, 165, 208, 224) with drafts written. `ocr:calibrate -- evaluate`: verdict `unmeasured`, 0 reliable references.
- `npm run eval:real-book`: NOT MEASURABLE, 0 approved chunks for every madhhab.

Counts: documents 16, chunks 868 (all quarantined Minhaj), approved searchable chunks 0, approved documents 0. Measured OCR accuracy: none. Real-book retrieval figures: none.

Blocked on people, not code: al-Quduri needs at least 10 human reference transcriptions of the selected pages (checked against the page images), a named reviewer, the edition as printed, and a rights/metadata approval. None of that was invented.

## Update 2026-10-27 (evening): two new Bahishti Zewar files

Detail in `docs/ocr-ingestion.md`, section "two new Bahishti Zewar files".

- `BahishtiZewar.pdf` (890 pages, SHA-256 `61d2ba3c…eebaa9`) is the English translation ("Heavenly Ornaments", Mahomedy, Zam Zam Publishers; imprint details read by OCR and unverified), not a second Urdu scan. The default `urd+ara` setting produced noise at confidence 44 to 52; `eng` reads at 93 to 94. `src/server/ocr/books.ts` gives it id `bahishti-zewar-en`, language `en`, OCR language `eng`; the Urdu scan keeps `bahishti-zewar`. Registered in `src/data/sources.ts` as `rights_review_required`. Test added in `tests/ocr-engine.test.ts`. 23 pages OCR'd in pilots, 0 indexed, verdict `unmeasured`.
- `behshatizewar.md.txt` is a 232-line English Markdown summary produced by a tool, with no page references. It is not evidence, not a calibration reference, and not registered as a book file.
- Open decision for the owner, not a code task: whether an English translation may be cited as evidence at all (English is the bridged language; answers are meant to rest on Arabic and Urdu source text), and, if so, rights clearance for the translation.

Verified: `npm test` 125 passed, `typecheck` and `lint` clean. Approved searchable chunks remain 0.

## Update 2026-10-27 (evening): every function exercised end to end

What was run on this machine, in this order, with the results:

- `npm run build` (prisma generate + next build): succeeds; 8 pages and 14 API routes compiled.
- `npm start` (production build) and an HTTP smoke test of every page and route: 47 of 47 checks passed. Covered: `/`, `/ask`, `/sources`, `/methodology`, `/privacy`, `/terms`, `/account`, `/admin`; `/api/languages` (exactly en, ur, ar), `/api/madhhabs`, `/api/sources`, `/api/status`; `/api/ask` in English, Urdu, Roman Urdu and Arabic for all four schools (each answered in the matching language with `insufficient_evidence`, 0 citations, human review recommended), explicit `answerLocale`, `INVALID_LOCALE`, `INVALID_MADHHAB`, `INVALID_REQUEST`; `/api/feedback` accept and reject; account register, read and update preferences, locale validation, duplicate email 409, delete, logout; admin login right and wrong, stats, sources, jobs, diagnose (Urdu question, 5 variants, approved pool 0), document review refusing approval without a verification note, institution review refusing a trusted pool without reviewer fields, upload of a text file (stored as `rights_review_required`, not searchable), duplicate upload, job retry, and admin routes closing after logout. Test records were removed from the store afterwards.
- Found and fixed while doing this: uploading the same bytes twice returned HTTP 500 (`DUPLICATE_FILE` thrown out of `storeUpload`). `postAdminUpload` now returns 409 `{ error: "DUPLICATE_FILE" }`; test added in `tests/ingest-security.test.ts`.
- Admin and account routes were returning `ADMIN_NOT_CONFIGURED` / `AUTH_NOT_CONFIGURED` because `.env` had no `AUTH_SECRET` or `ADMIN_PASSWORD`. Random local values were generated into `.env` (git-ignored, not in any document). They are local development credentials only.
- CLI: `ocr:doctor` (Tesseract 5.4 found, ara/urd/eng/osd present, one-page OCR smoke test 94.4 confidence on the English scan, 16 PDFs classified), `inventory:books`, `ocr:calibrate -- evaluate --book al-qaduri` (verdict `unmeasured`, 0 reliable references), `ocr:calibrate -- select --book bahishti-zewar-en` (8 sample pages chosen), `ocr:index -- book --book al-qaduri` (every page `accuracy_unmeasured`, nothing promoted), `eval:real-book` (NOT MEASURABLE, approved index empty), `ingest:open-text` (idempotent, skipped duplicate bytes). All ran without error.
- `npm test` 126 passed, `typecheck` and `lint` clean.
- Not run: `db:migrate` / `db:seed` / `worker` (they need the optional PostgreSQL; the app runs on the JSON store without it).

What "unblocked" does not mean here: no book became searchable. Approved chunks are still 0 for every school, so every question still returns `insufficient_evidence`. That gate opens only with human reference transcriptions (10 or more pages per book), a named reviewer, the edition as printed, and rights approval, none of which can be produced by code or by this assistant without fabricating them.

## Update 2026-10-27 (midday): show a single retrieved passage, do not hide it

The previous behaviour dropped every unmeasured OCR hit, so the user saw `insufficient_evidence` even when al-Quduri pages matched the question. That is now:

- One matching approved passage is enough to display. A second book is not required.
- If the approved index is empty, matching unmeasured OCR or pending-review text is shown as a labelled candidate. It is not approved evidence. No ruling is generated from it. Calibration thresholds were not lowered.
- Neighbouring PDF pages from the same book are added for context.
- Approved websites (`src/server/websites.ts`) are searched only when local approved evidence is empty. Seed `retrievalAllowed` stays false. Admin enablement requires a live page fetch. Off-domain URLs are refused.
- Admin diagnose lists approved matches, labelled candidates with rejection reasons, and skipped websites.

`ocr:index` now stores unmeasured OCR as candidate chunks (`searchable: false`, `ocrQuality: unmeasured`). Indexed without `--approve`: al-Quduri 72 chunks (36 pages), Bahishti Zewar English 19 chunks (12 pages). Minhaj stays quarantined unmeasured. Approved searchable chunks remain 0.

Verified: `npm test` 133 passed, typecheck and lint clean.
