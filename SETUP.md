# Quick Setup Guide

Follow these steps to get the Sprachen vocabulary trainer running locally.

For project background, see the [project page (DE)](https://martin-schneider.ch/tools/mcp-vokabeltrainer) / [EN](https://martin-schneider.ch/en/tools/mcp-vokabeltrainer). For a shorter overview, see [README.md](README.md).

This app is **local-only** (single-user, no auth). Do not expose it to the public internet without your own access control. There is no cloud/CDK deploy in this repo.

## Prerequisites

- Node.js 18+ installed
- OpenAI API account (for AI features / MCP tunnel)

No Docker or PostgreSQL required — the app uses **SQLite**.

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

```bash
# SQLite (path relative to prisma/)
DATABASE_URL="file:../data/sprachen.db"

# Mother tongue (set once)
NEXT_PUBLIC_NATIVE_LANG=de

# Optional: only train these targets (omit = all except native)
# NEXT_PUBLIC_TARGET_LANGS=en,es,fr

# OpenAI - https://platform.openai.com/api-keys
OPENAI_API_KEY="sk-..."

# Optional: ChatGPT MCP tunnel
CONTROL_PLANE_API_KEY=
TUNNEL_PROFILE=sprachen

NODE_ENV=development
```

### 3. Create the Database

```bash
npm run db:push
```

This creates an empty SQLite file at `data/sprachen.db` from `prisma/schema.prisma`.

### 4. Start Development Server

```bash
npm run dev
```

Starts the Next.js app (incl. MCP at `/mcp`) **and** the OpenAI MCP tunnel in parallel.

- App: [http://localhost:4800](http://localhost:4800)
- Web only: `npm run dev:web`
- Tunnel only: `npm run mcp:tunnel` (requires `CONTROL_PLANE_API_KEY`)

Without `CONTROL_PLANE_API_KEY` / `tunnel-client`, the webapp still starts; ChatGPT connectivity is skipped with a warning.

## ChatGPT MCP (Vocabulary Trainer)

The app exposes a Streamable HTTP MCP server at **`/mcp`**. ChatGPT connects via the OpenAI Secure MCP Tunnel (same pattern as Application Manager).

### Prerequisites

1. Install [`tunnel-client`](https://github.com/openai/tunnel-client/releases) (e.g. to `~/.local/bin/tunnel-client`).
2. Create an org API key with **Tunnels Read + Use**:  
   https://platform.openai.com/settings/organization/api-keys
3. Put it in `.env` as `CONTROL_PLANE_API_KEY=...`
4. Configure a tunnel profile named `sprachen` (or set `TUNNEL_PROFILE`) that points to  
   `http://localhost:4800/mcp`, with health listener on **4801** (next to the app port):

```bash
tunnel-client init \
  --sample sample_mcp_remote_no_auth \
  --profile sprachen \
  --tunnel-id tunnel_... \
  --mcp-server-url http://localhost:4800/mcp \
  --health-listen-addr 127.0.0.1:4801 \
  --force
```

### Start

```bash
npm run dev          # Next (port 4800, /mcp) + OpenAI tunnel
npm run dev:web      # Next only
npm run mcp:tunnel   # Tunnel only (strict: fails without key)
```

### ChatGPT

1. Enable **Developer Mode** (Settings → Apps → Advanced).
2. Create an app/plugin with the HTTPS URL from the tunnel.
3. Authentication: **None** (tunnel is the gate).
4. Scan tools, enable the plugin in a chat.

MCP tools are persistence-only (domains, entries, conjugations/`ConjugationForm`, review/Leitner, stats). ChatGPT generates vocabulary and runs the lesson; the server stores and grades answers.

## Notes

- Single-user mode (no login).
- Optional Docker app: `npm run docker:up` → port **4800**, SQLite via `./data` volume.
- Tests: `npm run test`.

## Troubleshooting

- **DB file missing**: run `npm run db:push`.
- **AI features fail**: check `OPENAI_API_KEY` in `.env`.
- **MCP tunnel missing key**: set `CONTROL_PLANE_API_KEY` in `.env`.
- **tunnel-client not found**: install the binary and ensure it is on `PATH`.
