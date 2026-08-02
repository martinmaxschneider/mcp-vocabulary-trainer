#!/usr/bin/env node
// Startet den OpenAI tunnel-client für den MCP-Endpoint.
// Liest vorher die .env, ohne bereits gesetzte Umgebungsvariablen zu überschreiben.
// Mit --optional (npm run dev): fehlender Key/Binary → Warnung, Exit 0 (Webapp läuft weiter).
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const packageDir = process.cwd();
const envPath = path.join(packageDir, ".env");
const optional = process.argv.includes("--optional");

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

loadEnvFile(envPath);

// Project .env wins for tunnel identity so a stale `export CONTROL_PLANE_API_KEY=...`
// in the same shell cannot keep an old key after .env was updated.
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

preferEnvFile(["CONTROL_PLANE_API_KEY", "TUNNEL_PROFILE", "CONTROL_PLANE_TUNNEL_ID"]);

if (!process.env.CONTROL_PLANE_API_KEY) {
  fail([
    "[mcp-tunnel] CONTROL_PLANE_API_KEY ist nicht gesetzt.",
    `[mcp-tunnel] Trage den Runtime-API-Key in ${envPath} ein:`,
    "[mcp-tunnel]   CONTROL_PLANE_API_KEY=sk-...",
    "[mcp-tunnel] Key erzeugen (Tunnels Read + Use): https://platform.openai.com/settings/organization/api-keys",
    optional
      ? "[mcp-tunnel] Webapp läuft ohne Tunnel weiter — ChatGPT-Anbindung fehlt."
      : "[mcp-tunnel] Die Next-App läuft unabhängig davon weiter – nur die ChatGPT-Anbindung fehlt.",
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
    "[mcp-tunnel]     --mcp-server-url http://localhost:4800/mcp \\",
    "[mcp-tunnel]     --health-listen-addr 127.0.0.1:4801 \\",
    "[mcp-tunnel]     --force",
    "[mcp-tunnel]",
    "[mcp-tunnel] tunnel_id: https://platform.openai.com/settings/organization/tunnels",
    ...(optional
      ? ["[mcp-tunnel] Webapp läuft ohne Tunnel weiter — ChatGPT-Anbindung fehlt."]
      : []),
  ]);
}

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
      "[mcp-tunnel] PATH: export PATH=\"$HOME/.local/bin:$PATH\"",
      ...(optional
        ? ["[mcp-tunnel] Webapp läuft ohne Tunnel weiter — ChatGPT-Anbindung fehlt."]
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
