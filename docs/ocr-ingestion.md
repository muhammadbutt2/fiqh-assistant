# OCR and book-ingestion pipeline

Written 27 October 2026. This describes what the code does today and how to run it on Windows with PowerShell. It makes no accuracy claim. As of this writing no book has a measured OCR accuracy, no OCR page is approved, and nothing from the local PDFs is indexed.

## The rule that did not change

OCR text cannot enter search until its accuracy has been measured against human-checked reference transcriptions, and the book has an owner approval for rights and metadata. Three layers enforce it and none were removed:

1. `applyReview` in `src/server/ingest.ts` only allows `searchable` when `ocrStatus` is `not_needed`, `measured_acceptable` or `measured_partial`.
2. `indexBook` in `src/server/ocr/index-pages.ts` only builds chunks for pages that passed the gate. An approval note cannot override a `failed`, `unmeasured`, `insufficient_samples` or `insufficient_coverage` verdict.
3. `chunkAllowed` in `src/server/retrieve.ts` rejects any chunk whose `ocrQuality` is not `not_needed` or `acceptable`, and any OCR chunk whose recorded accuracy status is not `passed`.

Thresholds are never lowered silently. Settings looser than the ceilings (CER 10%, WER 25%, critical-token 5%, page CER 25%, fewer than 6 reference pages) are refused unless `OCR_ALLOW_LOOSE_THRESHOLDS=true`, and then every report and chunk records `thresholdsLoosened`.

## Why ingestion failed before

- 14 of the 15 distinct PDFs are image-only scans (JBIG2 images, no text layer). Without an OCR engine they produced 0 characters.
- The Bahishti Zewar PDF has a text layer, but it is garbled, so the old per-document check could not use it.
- The old code judged a PDF as a whole, so a hybrid PDF could slip through half-extracted.
- `unpdf`'s bundled pdf.js cannot decode JBIG2. The renderer now uses `pdfjs-dist` 6.4.299 (legacy build, with its WASM decoders) so scans render instead of coming out blank.

## Install on Windows

```powershell
winget install -e --id UB-Mannheim.TesseractOCR
tesseract --version
tesseract --list-langs
```

Check `tesseract --list-langs`. The installer normally ships `eng` and `osd` only, so Arabic and Urdu data usually has to be added. The pipeline reads `.data/tessdata` automatically (git-ignored), so no admin rights are needed:

```powershell
New-Item -ItemType Directory -Force .data\tessdata | Out-Null
Invoke-WebRequest https://github.com/tesseract-ocr/tessdata_best/raw/main/ara.traineddata -OutFile .data\tessdata\ara.traineddata
Invoke-WebRequest https://github.com/tesseract-ocr/tessdata_best/raw/main/urd.traineddata -OutFile .data\tessdata\urd.traineddata
Invoke-WebRequest https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata -OutFile .data\tessdata\eng.traineddata
Invoke-WebRequest https://github.com/tesseract-ocr/tessdata_best/raw/main/osd.traineddata -OutFile .data\tessdata\osd.traineddata
```

Lookup order, so nothing is tied to one machine:

- Engine: `TESSERACT_CMD`, then `PATH`, then `Tesseract-OCR\tesseract.exe` under `%ProgramFiles%`, `%ProgramFiles(x86)%` and `%LOCALAPPDATA%\Programs`.
- Language data: `TESSDATA_PREFIX` (only if it holds `.traineddata` files), then `.data/tessdata`, then the engine default.
- Books folder: `BOOKS_DIR` in `.env` (see `.env.example`). There is no built-in fallback path.

When Tesseract or a language is missing, the pipeline stops with a named error (`OCR_ENGINE_UNAVAILABLE`, `OCR_LANGUAGE_DATA_MISSING`) and prints the install commands. Affected pages are recorded as `ocr_pending`. Nothing is guessed.

## Diagnose

```powershell
npm run ocr:doctor
npm run ocr:doctor -- --book al-qaduri
npm run ocr:doctor -- --no-smoke
npm run ocr:doctor -- --json
```

It reports environment and thresholds, the Tesseract version and language data (with fingerprints), a real page-render test, a one-page OCR smoke test (fails if it returns 0 characters), each PDF classified from a sample of pages (`text`, `scanned`, `hybrid`, `text_layer_unusable`, `unreadable`), duplicate files, existing OCR runs and calibration verdicts, and the exact reasons each book is not searchable. The report is saved to `.data/ocr/doctor-report.json`. It never starts a full OCR run.

## Pilot

A pilot works on one book and a small number of pages. It cannot start a full run.

```powershell
npm run ingest:pilot -- --book al-qaduri --dry-run
npm run ingest:pilot -- --book al-qaduri --limit 12 --preview 300
npm run ingest:pilot -- --book al-qaduri --pages "5,10-12"
npm run ingest:pilot -- --book bahishti-zewar --limit 4 --ocr-lang urd
npm run ingest:pilot -- --book al-qaduri --limit 12 --report .data\ocr\reports\qaduri-pilot.json
```

- `--limit` defaults to 5 and is capped by `OCR_PILOT_MAX_PAGES`. Pages are spread across the book.
- `--dry-run` writes nothing and starts nothing. It reports which pages have a usable text layer and which would need OCR.
- `--preview N` prints and saves the first N characters of each page, unedited.
- `--report` saves JSON plus a Markdown copy. Reports are also written under `.data/ocr/<sha256>/<config>/reports/`.
- Resume: repeat the same command. Pages already checkpointed with the same file hash and configuration are reused. Failed pages are retried unless `--no-retry-failed`.
- Per-book languages: Quduri, Hidayah and Hindiyyah use `ara`. Bahishti uses `urd+ara`. Override with `--ocr-lang`.

## Page extraction

Each PDF page is handled on its own:

1. The embedded text layer is read first. It is used if it passes the checks: at least 40 non-space characters, at least 70% of letters in the expected script, at most 2% replacement characters, at most 45% symbols, and a plausible common-word rate for pages with 30 or more tokens.
2. Only pages that fail those checks are rendered and OCR'd. Hybrid PDFs therefore work.
3. The original PDF page number is stored with every page. Printed page numbers are never inferred. They come only from a verified page map (below), otherwise they stay empty.
4. The OCR screen rejects a page whose text fails the same checks or whose mean Tesseract word confidence is below `OCR_MIN_PAGE_CONFIDENCE` (default 60). That is a screen, not an accuracy measurement.

## Checkpoints and long runs

Layout: `.data/ocr/<sourceSha256>/<configHash>/{manifest.json, progress.json, pages/NNNNN.json, reports/, calibration/}`.

- Pages are written atomically, so an interrupted run leaves no half-written page. Ctrl+C stops after the current page and says how to resume.
- The config hash covers OCR languages, DPI, pixel cap, page segmentation mode, rotation setting, confidence screen, Tesseract version, language-data fingerprints and the extraction rule versions. A changed file or setting gets a new folder, so pages are reprocessed, and old results are kept.
- Pages run in bounded batches (`OCR_BATCH_SIZE`) with `OCR_CONCURRENCY` workers and `OCR_THREADS_PER_JOB` threads each. Rendering is serialized and capped by `OCR_MAX_RENDER_PIXELS` to bound memory.
- A bad page is recorded as `failed` with an error code and the run continues. Errors cover missing executable, permission denied, corrupt or password-protected PDF, render failure, and timeout (`OCR_TIMEOUT_MS`).
- Progress shows pages done, remaining, failed, and an ETA.
- Chunk ids are deterministic, so re-indexing replaces rather than duplicates.

## Accuracy review

Accuracy is measured only against transcriptions a person wrote while looking at the page image.

```powershell
npm run ocr:calibrate -- select --book al-qaduri --count 12 --with-draft
npm run ocr:calibrate -- import --book al-qaduri --page 54 --file refs\qaduri-p54.txt --reviewer "Your Name" --edition "edition as printed on the title page" --notes "checked against the page image"
npm run ocr:calibrate -- evaluate --book al-qaduri
npm run ocr:calibrate -- status --book al-qaduri
```

- `select` picks pages from the front, middle and back, plus the poorest-confidence page, the best, rotated and layout-heavy pages where they exist. It writes `calibration/samples.json` and, with `--with-draft`, the raw OCR for each page to correct by hand.
- Save references as UTF-8 text. In PowerShell 5.1 do not use `Set-Content -Encoding UTF8` (it adds a BOM). Use your editor, or write with `[IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false))`.
- `import` stores the reference with reviewer, date, edition and a hash of both files. A reference identical to the OCR draft is excluded unless you pass `--confirm-identical` after checking the image. References shorter than `OCR_MIN_REFERENCE_CHARS`, edited after import, or whose OCR page later changed are excluded and listed.
- `evaluate` writes `calibration/report.json` and `report.md`. They list reliable pages, missing references, excluded references and why, strata covered and missing, and per-page results.
- Metrics: CER, WER and a critical-token error rate (negations, exceptions, legal terms from the glossary, and any token with a digit). Strict and folded results are reported separately. Strict only applies Unicode NFC, strips invisible bidi marks and collapses whitespace. Folded also removes harakat and tatweel and unifies alef, yeh, kaf, heh and digit forms. The gate uses `OCR_GATE_METRIC` (default `strict`). The files on disk are never edited.
- Verdicts: `unmeasured` (no reliable reference), `insufficient_samples`, `insufficient_coverage` (front, middle, back, and poor pages when any exist), `failed`, `passed`. They are recomputed from the current thresholds every time, never cached.

Defaults (override with the environment variables in `.env.example`):

| Setting | Variable | Default |
| --- | --- | --- |
| Aggregate CER | `OCR_MAX_CER` | 0.05 |
| Aggregate WER | `OCR_MAX_WER` | 0.15 |
| Critical-token error rate | `OCR_MAX_CRITICAL_ERROR_RATE` | 0.03 |
| Per-page CER | `OCR_MAX_PAGE_CER` | 0.15 |
| Reliable reference pages | `OCR_MIN_CALIBRATION_PAGES` | 10 |
| Minimum reference length | `OCR_MIN_REFERENCE_CHARS` | 150 |
| Page confidence screen | `OCR_MIN_PAGE_CONFIDENCE` | 60 |
| Poor-page confidence | `OCR_POOR_CONFIDENCE` | 75 |

The 10-page minimum is a floor for a verdict, not a claim that 10 pages represent a 255-page book. More references give a better estimate.

## Page states

Stored page stages are `text_extracted`, `ocr_pending`, `ocr_completed` and `failed`. The ten reporting states are derived from them:

`uploaded`, `text_extracted`, `ocr_pending`, `ocr_completed`, `accuracy_unmeasured`, `accuracy_failed`, `awaiting_review`, `approved_for_indexing`, `indexed`, `failed`.

Partial promotion: with a `passed` verdict, pages that pass the screen and their own per-page CER check can be indexed while other pages stay as `accuracy_failed`, `failed` or `ocr_pending`. The document is then `measured_partial`. Embedded-text pages that pass the checks need no OCR measurement.

## Index

Stop the dev server first. The JSON store is rewritten.

```powershell
npm run ocr:index -- book --book al-qaduri --dry-run
npm run ocr:index -- book --book al-qaduri
npm run ocr:index -- book --book al-qaduri --approve "Rights and edition checked: <what you checked>" --reviewer "Your Name"
```

Without `--approve`, chunks are stored but stay non-searchable (`awaiting_review`). `--approve` records your rights and metadata review and only takes effect on pages that passed the gates.

Each chunk stores: book id, title, author, edition, volume, madhhab, language, PDF page, printed page (only from a verified page map), chapter, original text, normalized text kept separately, OCR engine, version, language model and data fingerprints, mean confidence, accuracy status with the measured strict CER and WER and whether thresholds were loosened, source hash, configuration hash, and rights and approval status. Public citations carry the extraction method, accuracy status, OCR model and source hash.

To add printed page numbers, create `.data/page-maps/<bookId>.json` after checking the pages yourself:

```json
{ "verifiedBy": "Your Name", "verifiedOn": "2026-10-27", "edition": "edition label", "pages": { "11": 3, "12": 4 } }
```

Keys are PDF pages and values are printed pages. A file without `verifiedBy` and `verifiedOn` is ignored with a warning.

Third-party OCR text (for example the archive.org Minhaj text) is stored through `scripts/ingest-open-text.ts` and is quarantined as `third_party_ocr_unmeasured`. It is not searchable. Quarantine anything else with `npm run ocr:index -- quarantine --sha <sha256 prefix>`.

## Full ingestion

Only after a pilot looked right, and you accept that it can take hours per book:

```powershell
npm run ingest:full -- --book al-qaduri --dry-run
npm run ingest:full -- --book al-qaduri --confirm-full
```

`--all-books` exists for `ingest:full` and still needs `--confirm-full`. Full ingestion only produces OCR output. It does not make anything searchable. Calibration, then `ocr:index`, are still required. Resume by repeating the command.

## Findings from the local pilots

These are observations, not accuracy measurements.

- `al-qaduri.pdf`: 12 pages OCR'd with `ara`. Mean Tesseract word confidence was roughly 80 to 89 on those pages. Confidence is Tesseract's own estimate and does not equal accuracy. No human reference exists, so the verdict is `unmeasured`.
- `Bahishti Zewar`: 4 pages OCR'd under `urd+ara` and under `urd`. Confidence was 29 to 39 and every page failed the screen. The pages are dense Nastaliq script with a watermark. Tesseract is a poor fit. This book needs a different OCR engine or a text source, and then the same measurement.
- Rotation detection (`OCR_DETECT_ROTATION`, uses `osd`) is implemented and unit-tested only. It has not been tried on a real rotated page.
- The `al-qaduri.pdf` copyright page appears to name an edition. That reading is unverified and is not recorded as edition metadata.

## Status on 27 October 2026 (evening): al-Quduri calibration set prepared, still unmeasured

- `al-qaduri.pdf`: 36 pages OCR'd with `ara` (first pilot 12, second pilot 24 more; 0 failures; mean Tesseract confidence 82 to 89, which is not accuracy).
- `ocr:calibrate -- select --book al-qaduri --with-draft` chose 12 pages: 16, 38, 48, 59, 75, 91, 96, 117, 133, 165, 208, 224 (strata: front, middle, back, spread, layout_complex, clean). Raw OCR drafts for each are in `.data/ocr/<sha>/<config>/calibration/draft/`.
- Human references on disk: 0. Reviewer: none recorded. Edition: not recorded. Rights: `rights_review_required`.
- Verdict: `unmeasured`. The book is not indexed and not searchable. `ocr:index -- book --book al-qaduri` would store 0 searchable chunks.

To finish al-Quduri, a person must:

1. Open the PDF at each selected page and transcribe the full page (or correct the draft against the page image; an unchanged draft is rejected).
2. `npm run ocr:calibrate -- import --book al-qaduri --page <n> --file <transcription.txt> --reviewer "<name>" --edition "<edition as printed>"` for at least 10 pages.
3. `npm run ocr:calibrate -- evaluate --book al-qaduri`. The gate is CER <= 5%, WER <= 15%, critical-token errors <= 3%, per-page CER <= 15%, strict metric. Thresholds were not changed.
4. If it passes: `npm run ingest:full -- --book al-qaduri --confirm-full`, then `npm run ocr:index -- book --book al-qaduri --approve "<rights and metadata note>" --reviewer "<name>"`.
5. `npm run eval:real-book -- --book quduri` to get real top-5 / top-10 numbers for English, Urdu and Arabic questions.

## Real-book retrieval evaluation

`npm run eval:real-book -- [--madhhab hanafi] [--book <title part>]` runs five English/Urdu/Arabic question triplets against approved chunks only and writes a JSON report to `.data/eval/`. It reports `NOT MEASURABLE` while the approved index is empty, which is the current state.
