# [PROJECT NAME]

> **Source-available (noncommercial)** — the source code is public, but **commercial use is not allowed** without a separate commercial license.

[1–2 sentence project tagline / what problem it solves.]

---

## Overview

[Describe what this project does in plain language.]

### Key Features

- [Feature 1]
- [Feature 2]
- [Feature 3]

### Tech Stack

- [Runtime / Framework]
- [DB / Infra]
- [UI / Tooling]
- [CI / Testing]

---

## Getting Started

### Requirements

- Node.js 20+
- pnpm 9+ (or your chosen package manager)

### Install

```bash
pnpm install
cp .env.example .env
```

### Run Dev Server

```bash
pnpm dev
```

### Useful Scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format
pnpm format:check
```

### E2E (Playwright)

Install Playwright browser binaries once:

```bash
pnpm exec playwright install --with-deps chromium
```

Run the project-internal MVP smoke E2E locally:

```bash
pnpm test:e2e
```

Optional modes:

```bash
pnpm test:e2e:ui
pnpm test:e2e:headed
```

E2E env requirements (set in local shell/CI, not committed):

- `E2E_TEST_MODE=true`
- `LLM_PROVIDER=test`
- `ORCHESTRATOR_LLM_PROVIDER=test`
- `AGENT_RUN_LLM_PROVIDER=test`

In E2E mode, authentication uses a test-only guarded path and the LLM Gateway uses a deterministic in-repo test provider. No real OpenAI/Anthropic/production provider call is made.

---

## Runtime Observability

The server emits structured runtime logs for key failure paths (JSON-like objects via `console.error` / `console.warn`), with `runId` correlation when available.

### Tracked events

- `llm_parse_failed` — LLM JSON parse/schema validation failed (attempt-level and final exhaustion).
- `orchestrator_invalid_output` — orchestrator output rejected as invalid.
- `apply_engine_failed` — apply engine threw unexpectedly.
- `rate_limit_exceeded` — request blocked by LLM rate limit / mapped to 429.
- `daily_quota_exceeded` — request blocked by daily quota / mapped to 429.
- `run_failed` — run-level failure in orchestrator/agent route handling.

### Correlation fields

Common fields include: `runId`, `projectId`, `ticketId`, `userId`, `route`, `operation`, `runType`, `provider`, `model`, `statusCode`, `errorName`, `errorCode`, `timestamp`.

### Safe logging policy

The logger intentionally does **not** log:

- API keys, auth tokens, cookies, session values
- raw prompts or raw provider output
- full request payloads that may contain sensitive data
- verbose raw Zod dumps that can leak model output

### Search by runId

Search server logs for `runId: "<id>"` to correlate:

- route-level failures
- orchestrator/apply failures
- usage records linked to the same run

### Example log object (safe)

```json
{
  "timestamp": "2026-05-29T01:23:45.000Z",
  "level": "error",
  "event": "apply_engine_failed",
  "message": "Apply Engine failed during Replan",
  "runId": "run_123",
  "projectId": "project_abc",
  "operation": "apply_orchestrator_plan",
  "route": "POST /api/projects/[projectId]/orchestrator/replan",
  "errorName": "Error",
  "errorMessage": "Database write failed"
}
```

---

## Configuration

All environment variables are documented in `.env.example`.

Example placeholders (adjust to your project):

- `DATABASE_URL` — database connection string
- `AUTH_SECRET`, `AUTH_URL` — Auth configuration
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY` — server-only keys (do not expose to client)
- `LLM_PROVIDER`, `ORCHESTRATOR_LLM_PROVIDER`, `AGENT_RUN_LLM_PROVIDER` — choose `openai`, `anthropic`, or `deepseek`
- `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` — optional provider overrides
- `UPSTASH_*` — rate limiting / caching (optional)

---

## Project Structure (example)

```text
src/
  app/            # routes/pages (if applicable)
  components/     # UI components
  lib/            # shared utilities
  server/         # server-only logic
  db/             # database / prisma
```

---

## Roadmap

- [ ] MVP: [placeholder]
- [ ] V1: [placeholder]
- [ ] V2: [placeholder]

---

## Contributing

Contributions are welcome for **noncommercial** usage of this project.

- Open an issue describing the change
- Create a PR with a clear description
- Keep changes focused and well-tested

> By contributing, you agree your contributions will be licensed under the same terms as this repository (see **Licensing**).

---

## Licensing

This project is **source-available (noncommercial)**.

### License

This repository is licensed under the **PolyForm Noncommercial License 1.0.0**.  
See the `LICENSE` file in the repository root.

### Allowed (Noncommercial)

You may use, copy, modify, and redistribute this software **only for noncommercial purposes**, including:

- Personal learning, research, and experimentation
- Education/teaching, coursework, and academic projects
- Nonprofit or community use **as long as it does not generate revenue or commercial advantage**

### Not allowed (Commercial)

Any use **for commercial advantage or monetary compensation** is **not allowed**, including (non-exhaustive):

- Use in any commercial product or paid service
- SaaS / subscription / hosted offering
- Integration into a product sold or monetized in any way
- Use within a for-profit company (including internal tools that support business operations)
- Paid consulting / client delivery / contracting where this software is part of the deliverable
- Redistribution as part of a paid bundle, marketplace listing, or paid support offering

### Commercial licensing

If you want to use this project commercially, you **must obtain a separate commercial license**.

- Contact: **[YOUR_EMAIL_HERE]**
- Please include: your company/org, intended use (internal / distribution / SaaS / etc.), expected scale, and timeline.

See `COMMERCIAL_LICENSE.md` for commercial license options.

### How to apply this licensing in GitHub (repo checklist)

1. Add `LICENSE` at the repository root (PolyForm Noncommercial 1.0.0 full text).
2. Add `COMMERCIAL_LICENSE.md` to explain how to obtain commercial terms.
3. Keep the README wording as **“source-available (noncommercial)”** (avoid “OSI open source” wording).
4. (Optional) Add a short note in your GitHub repository description: “Source-available, noncommercial license”.
