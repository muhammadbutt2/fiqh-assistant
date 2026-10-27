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
