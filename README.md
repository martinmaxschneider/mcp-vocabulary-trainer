# Sprachen — Multilingual Vocabulary Trainer with MCP Agent

A local, single-user vocabulary trainer with Leitner spaced repetition, domain/topic organization, and a ChatGPT MCP agent for lessons — plus optional OpenAI assistance in the app.

## Project page

More background and write-up:

- [Deutsch](https://martin-schneider.ch/tools/mcp-vokabeltrainer)
- [English](https://martin-schneider.ch/en/tools/mcp-vokabeltrainer)

## Runs locally

This project is meant to run **on your own machine** (or local Docker). It is not a hosted SaaS, and there is no cloud/CDK deploy in this repo.

- Single-user, **no login / no auth**
- Data stays in a local SQLite file under `data/`
- Do not expose the app to the public internet without adding your own access control

## Features

- Leitner 6-box spaced repetition
- Multiple languages (UI + vocabulary): German, English, Spanish, French, Portuguese, Swiss German
- Domains/topics for organizing entries
- Fuzzy answer matching (typo-tolerant)
- Conjugation practice
- Grammar reference (cheat sheets; create/refine via MCP chat)
- Optional OpenAI-powered translation suggestions
- ChatGPT MCP at `/mcp` (persistence + review + grammar; AI stays in ChatGPT)

## Quick start

### Prerequisites

- Node.js 18+ and npm
- An [OpenAI API key](https://platform.openai.com/api-keys) if you want AI features (optional for core review)

### Initialize

```bash
git clone <this-repo-url>
cd sprachen

npm install
cp .env.example .env
```

Edit `.env` and set at least:

```bash
DATABASE_URL="file:../data/sprachen.db"
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_NATIVE_LANG=de
# Optional — train only some targets (omit = all except native):
# NEXT_PUBLIC_TARGET_LANGS=en,es,fr
```

`NEXT_PUBLIC_NATIVE_LANG` is your mother tongue / source language (`de` | `en` | `es` | `fr` | `pt` | `gsw`). Set it once at install time.

`NEXT_PUBLIC_TARGET_LANGS` limits which languages you train (comma-separated). Example: `en,es,fr` for three languages only. Leave empty for all targets except your native language. Restart the app after changing it.

Create or upgrade the SQLite database (applies Prisma migrations; backs up an existing DB to `data/backups/` first):

```bash
npm run db:migrate
```

Start the app:

```bash
npm run dev
```

Open [http://localhost:4810](http://localhost:4810).

`npm run dev` starts Next.js on port **4810** (MCP at `/mcp`) and the optional OpenAI MCP tunnel (health **4811**). Web only: `npm run dev:web`.

## Environment

Copy from [`.env.example`](.env.example):

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | SQLite path relative to `prisma/` (default `file:../data/sprachen.db`) |
| `OPENAI_API_KEY` | for AI features | OpenAI API key |
| `NEXT_PUBLIC_NATIVE_LANG` | yes | Source language (`de` by default) |
| `NEXT_PUBLIC_TARGET_LANGS` | no | Comma-separated targets, e.g. `en,es,fr` (empty = all except native) |
| `CONTROL_PLANE_API_KEY` | for ChatGPT tunnel | OpenAI org key with Tunnels Read + Use |
| `TUNNEL_PROFILE` | optional | Tunnel profile name (default `sprachen`) |

Never commit `.env` or `.env.production` — only `.env.example` is tracked.

## Docker (optional, local)

No separate database container. SQLite lives in `./data`:

```bash
export OPENAI_API_KEY=your_openai_api_key_here
npm run docker:up
```

App: [http://localhost:4810](http://localhost:4810).

## ChatGPT MCP

Persistence MCP at `/mcp` (domains, entries, conjugations, review/Leitner, grammar, stats). Details for `tunnel-client` and ChatGPT Developer Mode: [SETUP.md](SETUP.md).

```bash
npm run dev          # app + tunnel (development)
npm run start        # app + tunnel (after npm run build)
npm run start:web    # production web only
npm run mcp:tunnel   # tunnel only
```

### Grammar via chat

Grammar chapters live in the DB and are shown under **Grammatik** in the app. Content is created and refined in chat (ChatGPT/Claude with MCP):

1. **New** — learn a topic → AI asks whether to save → `create_grammar_topic` (RULE + EXAMPLES + NOTE)
2. **Resume** — “I want to learn possessives” → `search_grammar_topics` / `get_grammar_topic` → discuss from your saved chapter
3. **Personalize** — add your own mnemonic → `upsert_grammar_blocks` (after confirmation)

### Voice Chat workaround

ChatGPT **Voice Chat cannot call MCP tools directly**. Use text MCP first, then voice, then sync back:

1. **Load context in text chat** — ask ChatGPT (with the MCP plugin enabled) to fetch the vocabulary / due cards / lesson context you need via MCP.
2. **Start Voice Chat** — continue in the same conversation so that context is already in the thread.
3. **Practice by voice** — train as usual; Voice Chat only talks, it does not write to the database.
4. **Sync after voice** — switch back to text and tell ChatGPT something like: *„Okay, aktualisiere die Einträge basierend auf der Lehrer-Erfahrung.“* so it updates progress / entries through MCP.

Without that last step, the spoken lesson stays only in the chat history.

## Leitner boxes

Cards move through 6 boxes with increasing intervals:

| Box | Interval |
|-----|----------|
| 1 | immediately (0 days) — new cards and wrong answers |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 14 days |
| 5 | 30 days |
| 6 | 60 days |

Correct → one box up. Wrong → back to box 1. Due cards have `nextReviewAt` in the past.

## Tech stack

Next.js 15 · TypeScript · tRPC · SQLite + Prisma · Tailwind / shadcn/ui · OpenAI (optional) · Vitest

## Development

```bash
npm run lint
npm run test
npm run build
npm run db:migrate      # backup + apply migrations (default on every machine)
npm run db:migrate:dev  # create new migrations locally
npm run db:backup       # copy DB to data/backups/
npm run db:push         # optional schema sync shortcut
npm run db:studio
```

## License

MIT — see [LICENSE](LICENSE).
