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
pnpm format
pnpm format:check
```

---

## Configuration

All environment variables are documented in `.env.example`.

Example placeholders (adjust to your project):

- `DATABASE_URL` — database connection string
- `AUTH_SECRET`, `AUTH_URL` — Auth configuration
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — server-only keys (do not expose to client)
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
