# AI Islamic Fiqh Assistant

Ask Islamic jurisprudence questions and explore source-supported answers according to your selected Sunni school of thought.

This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment. It does not issue a binding ruling.

The schools are Hanafi, Maliki, Shafi'i, and Hanbali. A question is searched only inside the selected school. The index starts empty. Until a person approves a source, the app says the library is not populated and returns the no-evidence message instead of a guess.

## What is implemented

- Next.js App Router interface for school selection, answer language, asking, citations, account, and admin review.
- Twenty languages from the Wikipedia table of Ethnologue (2026) total speakers, with separate Simplified and Traditional Chinese locales. Direction follows the locale.
- File store by default, and a Prisma / PostgreSQL store when `DATABASE_URL` is set. Docker Compose is included for Postgres with pgvector. The vector column is not created, because no embedding model is configured.
- Upload, text extraction, chunking, and an OCR job that fails honestly when Tesseract is missing.
- OpenAI-compatible chat and translation adapters. With no API key they stay unavailable. The service does not invent a ruling.
- Citation checks for source id, exact excerpt, printed page, PDF page index, fatwa number, URL, and school.
- Institutional registry and acquisition manifest. Nothing in that registry is approved for retrieval.

Details: [docs/implementation-report.md](docs/implementation-report.md), [docs/institutional-source-registry.md](docs/institutional-source-registry.md), [docs/missing-book-manifest.md](docs/missing-book-manifest.md), [docs/deployment.md](docs/deployment.md).

## Local setup

```bash
npm install
copy .env.example .env
npm test
npm run typecheck
npm run build
npm start
```

Leave `AI_API_KEY` and `ADMIN_PASSWORD` empty unless you are configuring them yourself. An empty `AUTH_SECRET` is filled from `.data/auth-secret` on the local server. Do not commit `.env`, PDFs, or the `.data` directory.

`npm run db:seed` exits with an error when `DATABASE_URL` is unset. That is intentional.

## Tests

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Test passages are labelled `TEST FIXTURE` and are not production sources.
