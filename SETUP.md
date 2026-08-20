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

# OpenRouter - https://openrouter.ai/keys
# Models are chosen in Settings, not here.
OPENROUTER_API_KEY="sk-or-..."

# Optional: ChatGPT MCP tunnel
CONTROL_PLANE_API_KEY=
TUNNEL_PROFILE=sprachen

NODE_ENV=development
```

### 3. Create / Upgrade the Database

```bash
npm run db:migrate
```

Applies Prisma migrations under `prisma/migrations/`. If `data/sprachen.db` already exists, it is copied to `data/backups/` first. Fresh installs get a new DB; existing installs (previously created with `db push`) keep their data — the baseline migration is marked applied automatically, then only additive migrations run.

### 4. Start Development Server

```bash
npm run dev
```

Starts the Next.js app (incl. MCP at `/mcp`) and the OpenAI MCP tunnel in parallel.

- App: [http://localhost:4810](http://localhost:4810)
- Web only: `npm run dev:web`
- Tunnel only: `npm run mcp:tunnel` (requires `CONTROL_PLANE_API_KEY`)

Without `CONTROL_PLANE_API_KEY` / `tunnel-client`, the webapp still starts; ChatGPT connectivity is skipped with a warning.

## ChatGPT MCP (Vocabulary + Grammar)

The app exposes a Streamable HTTP MCP server at **`/mcp`**. ChatGPT connects via the OpenAI Secure MCP Tunnel (same pattern as Application Manager). The same endpoint works for other MCP clients (e.g. Claude Desktop) pointing at `http://127.0.0.1:4810/mcp`.

### Grammar learning loop

| Intent | Tools |
|--------|--------|
| Save a new chapter after learning | `list_grammar_topics` / `search_grammar_topics` → ask → `create_grammar_topic` |
| Resume a topic from the DB | `search_grammar_topics` → `get_grammar_topic` → discuss |
| Add a personal note/examples | ask → `upsert_grammar_blocks` |
| Larger rewrite | ask → `update_grammar_topic` |

Browse chapters in the app at `/grammar`. No content seed — empty tables until you save via chat.

### Prerequisites

1. Install [`tunnel-client`](https://github.com/openai/tunnel-client/releases) to `~/.local/bin` (must be on `PATH`).

   **Easiest (auto-detects Intel vs Apple Silicon):**

   ```bash
   ./scripts/install-tunnel-client.sh
   # bash (kein zsh nötig):
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bash_profile
   source ~/.bash_profile
   which tunnel-client
   ```

   **Intel Mac (x86_64) — manuell (bash):**

   ```bash
   mkdir -p ~/.local/bin && cd /tmp
   curl -L -o tunnel-client.zip \
     https://github.com/openai/tunnel-client/releases/latest/download/tunnel-client-v0.0.10-darwin-amd64.zip
   unzip -o tunnel-client.zip
   chmod +x tunnel-client
   mv tunnel-client ~/.local/bin/tunnel-client
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bash_profile
   source ~/.bash_profile
   which tunnel-client
   ```

   Apple Silicon uses `darwin-arm64` instead of `darwin-amd64`. If macOS blocks the binary: System Settings → Privacy & Security → Open Anyway.

2. Create an org API key with **Tunnels Read + Use**:  
   https://platform.openai.com/settings/organization/api-keys
3. Put it in `.env` as `CONTROL_PLANE_API_KEY=...` (this is an OpenAI org key with tunnel scope, separate from OpenRouter).
4. Configure a tunnel profile named `sprachen` (or set `TUNNEL_PROFILE`) that points to  
   `http://localhost:4810/mcp`, with health listener on **4811** (next to the app port) — **once per machine**:

```bash
tunnel-client init \
  --sample sample_mcp_remote_no_auth \
  --profile sprachen \
  --tunnel-id tunnel_... \
  --mcp-server-url http://127.0.0.1:4810/mcp \
  --health-listen-addr 127.0.0.1:4811 \
  --force
```

Use `127.0.0.1` (not `localhost`) so the client does not dial IPv6 `[::1]`. `npm run start` / `dev` wait for the app on port 4810 before starting the tunnel.


### Start

```bash
npm run dev          # Next (4810) + OpenAI tunnel
npm run dev:web      # Next only
npm run mcp:tunnel   # Tunnel only (strict: fails without key)
```

iPhone Daily (native app, no cloud): [docs/ios.md](docs/ios.md).

### ChatGPT

1. Enable **Developer Mode** (Settings → Apps → Advanced).
2. Create an app/plugin with the HTTPS URL from the tunnel.
3. Authentication: **None** (tunnel is the gate).
4. Scan tools, enable the plugin in a chat.

MCP tools are persistence-only (domains, entries, conjugations/`ConjugationForm`, review/Leitner, stats). ChatGPT generates vocabulary and runs the lesson; the server stores and grades answers.

## Notes

- Single-user mode (no login).
- Optional Docker app: `npm run docker:up` → port **4810**, SQLite via `./data` volume.
- Tests: `npm run test`.

## Troubleshooting

- **DB file missing / schema outdated**: run `npm run db:migrate` (backs up existing DB to `data/backups/` first).
- **Restore from backup**: copy a file from `data/backups/` back to `data/sprachen.db`.
- **AI features fail**: check `OPENROUTER_API_KEY` in `.env` and the models in Settings.
- **MCP tunnel missing key**: set `CONTROL_PLANE_API_KEY` in `.env`.
- **tunnel-client not found**: install the binary and ensure it is on `PATH`.
