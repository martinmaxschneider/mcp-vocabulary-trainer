#!/usr/bin/env node
// Startet den OpenAI tunnel-client für den MCP-Endpoint.
// Liest vorher die .env, ohne bereits gesetzte Umgebungsvariablen zu überschreiben.
// Mit --optional (npm run dev/start): fehlender Key/Binary/Profil → Warnung, Exit 0.
// Wartet auf Next.js (Port 4800), bevor tunnel-client startet — sonst OAuth/MCP probe fails.
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const packageDir = process.cwd();
const envPath = path.join(packageDir, ".env");
const optional = process.argv.includes("--optional");
const MCP_ORIGIN = process.env.MCP_ORIGIN ?? "http://127.0.0.1:4800";
/** Max wait only — exits as soon as the app answers (usually <2s). */
const WAIT_MS = Number(process.env.MCP_TUNNEL_WAIT_MS ?? 30_000);
const POLL_MS = 500;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function fail(messages) {
  console.error(messages.join("\n"));
  process.exit(optional ? 0 : 1);
}

function preferEnvFile(keys) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  const wanted = new Set(keys);
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!wanted.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) process.env[key] = value;
  }
}

/** True when Next is accepting connections (any HTTP response, incl. 404/405). */
function probeApp() {
  return new Promise((resolve) => {
    const req = http.get(`${MCP_ORIGIN}/`, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForApp() {
  const deadline = Date.now() + WAIT_MS;
  console.log(
    `[mcp-tunnel] Warte auf App unter ${MCP_ORIGIN} (max ${WAIT_MS / 1000}s) …`,
  );
  while (Date.now() < deadline) {
    if (await probeApp()) {
      console.log(`[mcp-tunnel] App erreichbar unter ${MCP_ORIGIN}`);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  fail([
    `[mcp-tunnel] Timeout: ${MCP_ORIGIN} antwortet nicht.`,
    "[mcp-tunnel] Stelle sicher, dass Next.js läuft (npm run start / npm run dev).",
    ...(optional
      ? ["[mcp-tunnel] Webapp-Prozess prüfen — Tunnel wird übersprungen."]
      : []),
  ]);
}

function startTunnelClient(profile) {
  console.log(`[mcp-tunnel] Starte tunnel-client (Profil: ${profile}) …`);

  const child = spawn("tunnel-client", ["run", "--profile", profile], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      fail([
        "[mcp-tunnel] tunnel-client wurde nicht gefunden.",
        "[mcp-tunnel] Installation: npm run mcp:install-client  (siehe SETUP.md)",
        '[mcp-tunnel] PATH: export PATH="$HOME/.local/bin:$PATH"',
        ...(optional
          ? [
              "[mcp-tunnel] Webapp läuft ohne Tunnel weiter — ChatGPT-Anbindung fehlt.",
            ]
          : []),
      ]);
    } else {
      console.error("[mcp-tunnel] Startfehler:", error);
      process.exit(optional ? 0 : 1);
    }
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    if (optional && code && code !== 0) {
      console.error(
        `[mcp-tunnel] tunnel-client beendet (code ${code}) — Webapp läuft weiter.`,
      );
      process.exit(0);
    }
    process.exit(code ?? 0);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
}

async function main() {
  loadEnvFile(envPath);
  preferEnvFile([
    "CONTROL_PLANE_API_KEY",
    "TUNNEL_PROFILE",
    "CONTROL_PLANE_TUNNEL_ID",
  ]);

  if (!process.env.CONTROL_PLANE_API_KEY) {
    fail([
      "[mcp-tunnel] CONTROL_PLANE_API_KEY ist nicht gesetzt.",
      `[mcp-tunnel] Trage den Runtime-API-Key in ${envPath} ein:`,
      "[mcp-tunnel]   CONTROL_PLANE_API_KEY=sk-...",
      "[mcp-tunnel] Key erzeugen (Tunnels Read + Use): https://platform.openai.com/settings/organization/api-keys",
      ...(optional
        ? [
            "[mcp-tunnel] Webapp läuft ohne Tunnel weiter — ChatGPT-Anbindung fehlt.",
          ]
        : [
            "[mcp-tunnel] Die Next-App läuft unabhängig davon weiter – nur die ChatGPT-Anbindung fehlt.",
          ]),
    ]);
  }

  const profile = process.env.TUNNEL_PROFILE ?? "sprachen";
  const profilePath = path.join(
    process.env.HOME ?? "",
    ".config",
    "tunnel-client",
    `${profile}.yaml`,
  );

  if (!fs.existsSync(profilePath)) {
    fail([
      `[mcp-tunnel] Profil fehlt: ${profilePath}`,
      "[mcp-tunnel] Einmalig auf diesem Mac anlegen (echte tunnel_… ID einsetzen):",
      "[mcp-tunnel]",
      "[mcp-tunnel]   tunnel-client init \\",
      "[mcp-tunnel]     --sample sample_mcp_remote_no_auth \\",
      `[mcp-tunnel]     --profile ${profile} \\`,
      "[mcp-tunnel]     --tunnel-id tunnel_DEINE_ID \\",
      "[mcp-tunnel]     --mcp-server-url http://127.0.0.1:4800/mcp \\",
      "[mcp-tunnel]     --health-listen-addr 127.0.0.1:4801 \\",
      "[mcp-tunnel]     --force",
      "[mcp-tunnel]",
      "[mcp-tunnel] tunnel_id: https://platform.openai.com/settings/organization/tunnels",
      ...(optional
        ? [
            "[mcp-tunnel] Webapp läuft ohne Tunnel weiter — ChatGPT-Anbindung fehlt.",
          ]
        : []),
    ]);
  }

  await waitForApp();
  startTunnelClient(profile);
}

void main();
