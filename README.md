# CallAudit AI — AI Call QA Auditor

Multi-tenant web app that turns authorized call recordings into evidence-backed QA scorecards:
transcribe → score against a configurable checklist → show verifiable evidence → let a supervisor
correct and finalize. Built to the `CallAudit_AI_MVP_Specification` (v1.0, 12 Oct 2026).

The specification recommends React + Vite + FastAPI. This implementation delivers the same MVP scope
as **one deployable Next.js 15 app** (App Router + API routes + in-process worker), because a single
Node process on your own server is the shortest path to "live on my server". All security, validation,
scoring and tenant-isolation behaviour from the spec is preserved.

---

## 1. What is implemented (MVP "must ship")

| Spec requirement | Where |
| --- | --- |
| Auth, org setup, roles (admin / qa_manager / qa_reviewer / viewer) | `src/server/services/org.ts`, `src/lib/rbac.ts`, `src/lib/auth.ts` |
| Audio upload (validated) + CSV import for agents and call metadata | `src/lib/storage.ts`, `src/server/services/calls.ts`, `src/server/services/directory.ts` |
| Private storage, status, retries, visible errors | `storage/` (outside web root), `src/server/queue.ts`, `job_attempts` table |
| Transcription + structured QA against configurable scorecards | `src/server/providers/*`, `src/server/pipeline.ts`, `src/server/prompt.ts` |
| Evidence-backed findings with timestamps, confidence, review flags | `src/lib/scoring.ts` + `qa_findings` |
| Human review: accept / correct / reject / finalize + audit trail | `src/server/services/calls.ts`, `reviews`, `audit_logs` |
| Dashboard, filters, CSV export, retention, tenant-isolation tests | `src/server/services/reports.ts`, `tests/tenant.test.ts` |

Out of scope, exactly as the spec requires: live call monitoring, telephony/dialer, CRM integrations,
automated disciplinary actions, model training.

**Scoring integrity rules enforced in backend code, never by the model:**

- Model output is validated with a zod schema; unknown/duplicate/missing `criterion_id` fails the job.
- Points are clamped to the criterion maximum; totals are recomputed server-side (`validateQaOutput`).
- Every evidence quote is verified against the transcript; unverifiable quotes are flagged
  `verified: false` and force human review, along with critical criteria and confidence < 0.70.
- AI score and human-final score are stored separately; finalized results are immutable.
- Transcript content is treated as untrusted data (see the versioned prompt, `src/server/prompt.ts`).

## 2. Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 3 · Prisma 6 · SQLite by default
(Postgres supported) · zod · jose (JWT session cookie) · bcryptjs · Vitest.

Database default is SQLite so it runs on your server with zero infrastructure. Audio files are stored on
disk under `STORAGE_DIR` and are only reachable through an authenticated, tenant-checked API route —
never a public folder.

## 3. Run it locally (Windows PowerShell)

The delivery zip contains source only — `node_modules`, `.next`, the SQLite database, the `storage/`
recordings and any `.env*` file are deliberately excluded, so secrets and data never travel with the code.

```powershell
cd C:\path\to\callaudit-ai
Copy-Item .env.example .env
npm install
npm run setup          # prisma generate + db push + seed demo data
npm run dev            # http://localhost:3000
```

Use `.env` (not `.env.local`) as the file you edit: the Prisma CLI only reads `.env`, and Next.js reads
both. `.env.local` is optional if you want to override values for Next.js alone.

Sign in with a seeded demo account (password `ChangeMe2026!`):
`admin@pilotbpo.test`, `qa.manager@pilotbpo.test`, `reviewer@pilotbpo.test`, `viewer@pilotbpo.test`.

Other useful commands:

```powershell
npm run typecheck      # tsc --noEmit
npm test               # vitest: scoring validation, csv, upload validation, tenant isolation
npm run lint
npx prisma studio      # browse the data
```

## 4. Going live on your server

### Option A — plain Node (any VPS)

```bash
git clone <your-repo> callaudit-ai && cd callaudit-ai     # or upload the zip and unzip it
cp .env.example .env
npm ci
# EDIT .env:  NODE_ENV=production, a real AUTH_SECRET, STORAGE_DIR, provider keys
openssl rand -hex 32          # paste the result into AUTH_SECRET
npx prisma generate
npx prisma db push            # or: npm run db:migrate for versioned migrations
npm run build
PORT=3000 npm run start       # instrumentation.ts starts the background worker
```

Put nginx/Caddy in front for TLS and proxy to `127.0.0.1:3000`; the app sets
`X-Content-Type-Options` and `Cache-Control: no-store` on `/api/*`. Persist `STORAGE_DIR` and the SQLite
file (`prisma/dev.db`) on disk and back both up.

### Option B — Docker

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d --build
docker compose logs -f callaudit
```

Data (DB + recordings) lives in the `callaudit-data` volume. Health check: `GET /api/v1/health`.
Add `&& npm run db:seed` to the Dockerfile CMD once, only if you want demo data.

### First run on an empty database

The first account created at `/setup` becomes the admin of a new organization. After that, registration
is closed and users join only through invite tokens generated on the Organization page (7-day expiry).

## 5. Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | Switch `provider` in `prisma/schema.prisma` to `postgresql` for Postgres |
| `AUTH_SECRET` | — | **Required in production** (32+ chars); startup check refuses insecure production config |
| `STORAGE_DIR` | `./storage` | Must stay inside the project and outside any public/web root |
| `MAX_UPLOAD_MB` | `100` | Server-side hard limit; per-org `maxUploadMb` can only lower it |
| `STT_PROVIDER` / `LLM_PROVIDER` | `mock` | `mock` = offline simulated pipeline (zero cost), `openai` = real APIs |
| `OPENAI_API_KEY` | — | Backend-only. Never exposed to the browser |
| `STT_MODEL` / `LLM_MODEL` | `whisper-1` / `gpt-4o-mini` | |
| `EST_COST_PER_AUDIO_MINUTE_USD`, `EST_COST_PER_1K_*_TOKENS_USD` | see `.env.example` | Used only for cost *estimates* in dashboards/reports |
| `WORKER_ENABLED` | `true` | Set `false` and call `POST /api/v1/jobs/status` from cron if you prefer external scheduling |
| `JOB_MAX_ATTEMPTS` | `3` | Bounded exponential backoff, transient errors only |
| `LOW_CONFIDENCE_THRESHOLD` | `0.7` | Below this a finding is forced into human review |
| `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MS` | `240` / `60000` | In-memory per IP+path; use Redis if you run multiple instances |

### Using the real AI providers

```dotenv
STT_PROVIDER=openai
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Then upload a real recording on **Import**. Transcription and evaluation cost money per call: durations,
models, tokens, latency, retries and estimated cost are logged per job attempt (`JobAttempt`) and
surfaced in the call detail page, dashboard and reports.

> **Honesty note.** With `STT_PROVIDER=mock` / `LLM_PROVIDER=mock` (the default) the app runs a
> deterministic offline pipeline so you can pilot the full workflow with no API cost and no data leaving
> the machine. Every screen labels these results **SIMULATED**. They are not real speech-to-text or LLM
> output and must not be used to judge agent performance. A real provider failure is recorded as a failed
> job — it is never replaced with a fake score.

## 6. API surface (`/api/v1`, all authenticated except `/health`)

`POST auth/register` · `POST auth/login` · `POST auth/logout` · `GET me` · `GET dashboard/summary` ·
`GET/POST agents` · `POST agents/import` · `GET/POST campaigns` · `POST imports/calls-preview` ·
`GET/POST scorecards` · `GET scorecards/{id}` · `POST scorecards/{id}/versions` ·
`PUT scorecard-versions/{v}/criteria` · `POST scorecards/{id}` (publish) · `POST scorecard-versions/{v}/publish` · `POST uploads` ·
`GET/POST calls` (202 + queued on create) · `GET/DELETE calls/{id}` · `POST calls/{id}/retry` ·
`GET calls/{id}/transcript` · `GET calls/{id}/qa-result` · `GET calls/{id}/audio` (range-capable, signed or
session) · `PATCH qa-findings/{id}` · `POST qa-results/{id}/finalize` · `GET reports/summary` ·
`GET reports/export` · `GET audit-logs` · `GET/PATCH organization` · `GET/POST organization/members` ·
`PATCH/DELETE organization/members/{id}` · `POST organization/purge` · `GET jobs/status` · `GET health`

Organization scope always comes from the verified session cookie; a client-supplied `organization_id` is
never read. Errors are consistent `{ error: { code, message, requestId, details } }` and never leak stack
traces, storage paths or keys.

## 7. Data model

`organizations`, `users`, `memberships`, `agents`, `campaigns`, `scorecards`, `scorecard_versions`,
`criteria`, `calls`, `transcripts`, `qa_results`, `qa_findings`, `reviews`, `audit_logs`, `job_attempts` —
UUID primary keys, UTC timestamps, indexes, and **composite foreign keys** `(id, organization_id)` so a
call, transcript, score or finding can never reference a record from another organization (asserted in
`tests/tenant.test.ts`). Published scorecard versions are immutable and historical results keep the exact
version they were scored with.

> SQLite/Postgres enforce the tenant keys and every query is tenant-scoped in code. Postgres deployments
> that need defence in depth should additionally enable RLS — the schema is ready for policies, they are
> not enabled for SQLite.

## 8. Tests

```powershell
npm test
```

Covers: AI-output validation (clamping, invented-evidence detection, missing/unknown criteria, malformed
JSON), final-total recalculation, cost estimation, CSV parse/map/export, upload validation (extension,
MIME mismatch, content sniff, size cap, empty file), the RBAC matrix, and cross-tenant isolation for
calls, agents, findings plus the composite-FK constraint.

## 9. Pilot workflow (maps to the spec's 4-week plan)

1. **Week 1** — sign in, set timezone, invite the QA team, tune the seeded scorecard.
2. **Week 2** — import agents CSV, create campaigns, upload a batch of authorized recordings, watch job status.
3. **Week 3** — review: play audio, click transcript lines, accept/correct/reject findings with notes, finalize.
4. **Week 4** — dashboard/reports: AI vs final score separation, correction rate, review-time comparison,
   CSV export for the baseline comparison, retention purge, audit log review.

Baseline note: "time saved %" uses a manual baseline of 12 minutes per call which you can change in
`src/server/services/reports.ts`; review minutes are captured per call at finalize time.

## 10. Security checklist status

| Control | Status |
| --- | --- |
| Tenant isolation (code + composite FKs) | Implemented and tested |
| Managed auth + role checks in backend | Session JWT (httpOnly, SameSite=Lax, Secure in prod) + RBAC middleware; bcrypt password hashing |
| Private audio, short-lived signed access | `signAudioToken` (5 min) + session check + object-ownership verification |
| Secrets only server-side | Provider key read only in `src/server/providers/*`; a browser-facing route never returns it |
| Data minimization | Only `agent_code`, campaign, duration and language hint go to the LLM; no customer identifiers |
| Retention + deletion | Per-org `retentionDays`, soft delete, purge endpoint removing audio + transcripts + derived rows |
| Audit trail | Access, exports, corrections, finalization, membership and settings changes; raw text/keys redacted |
| Rate limits + quotas | Per-IP route limiter, `MAX_UPLOAD_MB`, per-org `monthlyCallCap` |
| Human oversight | Provisional scores require explicit finalization; critical/low-confidence findings always flagged |
| Dependency patching | Pinned to the latest patched Next 15 release; run `npm audit` on every deploy and keep `next` current |
| Provider governance / DPDP | **Your responsibility**: review provider retention, training use, subprocessors and transfer locations, and confirm the lawful basis for processing with qualified counsel before production |

## 11. Known limitations (read before a paid pilot)

- The worker runs in-process; a single Node instance processes jobs (concurrency 2). Multiple app replicas
  need a real queue (BullMQ/Redis) or a separate worker process.
- In-memory rate limiting is per instance.
- Uploads are buffered in memory (`MAX_UPLOAD_MB`); very large files need streaming to S3-compatible storage.
- No telephony integration — recordings must be exported from your existing system.
- Transcription of Indian-language and code-mixed audio varies widely by provider and accent; measure
  evidence validity per language before trusting scores (spec §14).
- SQLite is fine for a pilot; move to Postgres for concurrent multi-team production load.
- This is an MVP build from a spec document, not a security-audited production system.

## 12. Project layout

```
prisma/schema.prisma          tenant model, composite FKs
instrumentation.ts            worker bootstrap + resume-on-boot
src/app/api/v1/**             authenticated API (withHandler: rate limit, auth, RBAC, errors)
src/app/(auth)/**             login + first-run setup
src/app/(app)/**              dashboard, calls, import, scorecards, reports, organization
src/lib/**                    env, db, auth, rbac, errors, storage, csv, scoring, rate limit
src/server/providers/**       STT + LLM adapters (mock and openai)
src/server/services/**        tenant-scoped business operations
src/server/pipeline.ts        transcribe -> evaluate -> validate -> persist
src/server/queue.ts           claims, retries, backoff, resume
tests/**                      vitest suites
```
