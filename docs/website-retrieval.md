# Approved website retrieval

Written 27 October 2026. Seed `retrievalAllowed` values were not bulk-changed. New websites default to disabled.

## What is operational

The pipeline is:

1. Keep the original question.
2. Read the selected madhhab and response language.
3. Build Arabic and Urdu query variants (terminology, or a translation provider if configured).
4. Search the approved local book index.
5. If that index has no matching approved passage, search only institutions with `retrievalAllowed: true` whose trusted pool includes the selected madhhab.
6. For each hit, fetch the article page on an allowed host and path. A search snippet is not evidence.
7. Show the retrieved passage with a direct link. Institutional pages are not quotations from a classical fiqh book, and no ruling is generated from them when the language model is off.
8. If both the book index and enabled websites return nothing usable, the answer is insufficient evidence. Nothing is invented.

Admin routes:

- `POST /api/admin/websites` — live test of one institution. Records `lastRetrievalTest`. Does not enable retrieval.
- `POST /api/admin/sources` with `retrievalAllowed: true` — enable one institution after identity check, terms review (`reviewed_query_time_link`), trusted pool, methodology note, check date, reviewer note, a dedicated `testQuestion`, and a live test that retrieves at least one full page.

## First site: Jabatan Mufti Wilayah Persekutuan

- Domain: `muftiwp.gov.my`
- Method: official OpenSearch RSS (`/en/carian?q={searchTerms}&format=feed&type=rss`)
- Paths: `/en/artikel/`, `/ms/artikel/`
- Madhhab: Shafi'i statutory starting point (Act 505). Trusted pool is empty in the seed and becomes `shafii` only if an admin enables the record.
- Terms: query-time link and excerpt only. The corpus is not stored.
- Seed: `retrievalAllowed: false`

Other seed institutions stay disabled. Limitations (no compliant search, HTTP 403, coming-soon page, mixed methodology, robots-disallowed APIs) are recorded on each row.

## Live versus mocked tests

- Mocked tests: `tests/websites.test.ts` (19 tests). These do not touch the network.
- Live HTTP test: `tests/websites.live.test.ts`, run with `LIVE_WEBSITE_TEST=1`.
- Operational enablement (local store only, not the seed): `npx tsx scripts/live-website-enable.ts --confirm` or Admin → Website retrieval test → Verify and enable retrieval.

A mocked test is not a live retrieval test. The seed in git still has `retrievalAllowed: false` for every institution.

Live check on 27 October 2026 (Asia/Karachi): OpenSearch RSS for `wudu` returned article URLs on `muftiwp.gov.my`. An `/en/arkib/` result was rejected as off-path. Full `itemprop=articleBody` text was fetched from `/en/artikel/...`. A Shafi'i question then produced `evidenceRole: institutional` with direct links and no generated ruling. A Hanafi question did not search this site (trusted pool is `shafii` only) and fell through to labelled local OCR candidates. Approved book chunks remained 0.

The site's own search ranking can return a weakly related article. That page is shown as an institutional excerpt, not as a proof of a specific ruling.

## Al-Quduri

OCR calibration thresholds were not changed. The local scan remains `unmeasured` (0 human references). Candidate chunks may appear as labelled drafts. They are not approved evidence.

Remaining human actions:

1. Transcribe at least 10 selected pages against the PDF image (drafts are under `.data/ocr/<sha>/<config>/calibration/draft/`).
2. `npm run ocr:calibrate -- import --book al-qaduri --page <n> --file <transcription.txt> --reviewer "<name>" --edition "<edition as printed>"`
3. `npm run ocr:calibrate -- evaluate --book al-qaduri` (CER 5%, WER 15%, critical 3%, per-page CER 15%, strict metric).
4. If it passes: `npm run ingest:full -- --book al-qaduri --confirm-full` then `npm run ocr:index -- book --book al-qaduri --approve "<rights and metadata note>" --reviewer "<name>"`
5. `npm run eval:real-book -- --book quduri`

Do not claim Mukhtasar al-Quduri is searchable until those steps produce approved chunks that a real question retrieves.
