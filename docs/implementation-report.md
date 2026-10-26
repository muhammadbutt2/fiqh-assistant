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
- Ingestion accepts PDF, EPUB, HTML, and text after magic-byte checks. Printed pages stay null. Image-only PDFs fail with `OCR_ENGINE_UNAVAILABLE` on this machine because Tesseract is not installed.
- Accounts use scrypt passwords and an HMAC cookie. Admin and account routes return 503 until `AUTH_SECRET` and, for admin, `ADMIN_PASSWORD` are set. Uploads cannot mark themselves searchable. Audit rows store the question hash, not the question text.
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
- Tesseract and Python are not installed. OCR does not run.
- Docker was installed but the daemon was not running, so Postgres, migrate, seed, and `search.sql` were not applied.
- Every checked institution has an empty trusted pool and `retrievalAllowed: false`.
- Local PDFs are quarantined. Rights were not cleared. Filename digits on the Hidayah set do not match the volume numbers in the PDF info dictionary.
- `npm audit` reported vulnerabilities when dependencies were installed. `npm audit fix --force` was not run.
- No browser pass beyond happy-dom.

Prompt and answer-generation version: `2026-10-26.1`.
