# Deployment

Checked on this machine on 26 October 2026. Node 24 and npm 11 were available. Docker was installed, but the Docker engine was not running (`dockerDesktopLinuxEngine` pipe missing), so Postgres was not started and `prisma migrate deploy` was not applied. Python and Tesseract were not installed. No API key was provided.

## 1. Install

```bash
npm install
```

`postinstall` runs `prisma generate`. The client is generated from `prisma/schema.prisma`. The schema enum `Madhhab` has only `hanafi`, `maliki`, `shafii`, and `hanbali`.

## 2. Environment

Copy `.env.example` to `.env`. Placeholders only:

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | Postgres. Local Compose default is `postgresql://fiqh:fiqh-local-only@localhost:5432/fiqh`. Omit it to use the JSON file store. |
| `AUTH_SECRET` | HMAC key for the `fiqh_session` cookie. Empty means account and admin routes return 503. |
| `ADMIN_PASSWORD` | Admin password. Empty keeps the admin closed. |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_CHAT_MODEL` | OpenAI-compatible chat. Empty key means no generated ruling. |
| `AI_EMBEDDING_MODEL` | Recorded for a future embedder. No embedding calls are made. |
| `AI_TRANSLATION_MODEL`, `TRANSLATION_BASE_URL`, `TRANSLATION_API_KEY` | Optional translation endpoint. |
| `STORAGE_DIR` | Uploaded bytes. Gitignored when left under `.data`. |
| `STORE_PATH` | JSON store used when `DATABASE_URL` is unset. |
| `BOOKS_DIR` | Optional local folder for `npm run inventory:books`. Files are not copied into git. |
| `MAX_UPLOAD_BYTES`, `ASK_RATE_LIMIT_PER_HOUR` | Abuse limits. |
| `TESSERACT_CMD`, `OCR_LANGUAGES` | OCR. Empty command is treated as missing. |
| `LOG_QUESTION_TEXT` | Reserved. The audit log stores a SHA-256 of the question, not the question text. |

## 3. Database

Start the engine, then:

```bash
docker compose up -d
npx prisma migrate deploy
```

`prisma/migrations/20261026180000_init` is the schema migration. It was generated with `prisma migrate diff` and was not applied here.

After migrate, optional lexical index:

```bash
psql "$DATABASE_URL" -f prisma/sql/search.sql
```

That file creates the `vector` extension and a `simple` tsvector on normalized chunk text. It does not add an embedding column. `simple` does not stem Arabic or Urdu.

Seed institutions and acquisition rows only. It does not insert book text. It exits non-zero if `DATABASE_URL` is missing.

```bash
npm run db:seed
```

## 4. Process

Development: `npm run dev`.

Production:

```bash
npm run build
npm start
```

Queued ingestion can also be drained with `npm run worker`. The worker uses the same store as the app. There is no Redis queue.

Uploads are stored under `STORAGE_DIR` with a random id filename. Printed page numbers stay empty unless a page map is supplied. If extracted text is thinner than 20 characters per page, the job fails with `OCR_ENGINE_UNAVAILABLE` when Tesseract is missing, or `OCR_NOT_RUN_ACCURACY_UNMEASURED` when the binary exists but accuracy has not been measured. Neither path invents text.

## 5. What stays closed

- Admin review cannot mark a document approved without a verification note, methodology, and check date.
- An institution cannot be added to a trusted pool without the same kind of note. `retrievalAllowed` stays false.
- Test fixtures are excluded unless a test passes `allowTestFixtures`. HTTP handlers never do.
- High-stakes questions and disagreeing passages return `human_review_required`. The response says no review has taken place.

## 6. Checks run on 26 October 2026

`npm test` (34 tests), `npm run typecheck`, and `npm run lint` passed before the production build recorded in the implementation report. A browser viewport was not available in this session, so the pages were not clicked in a real browser. The UI tests use happy-dom.
