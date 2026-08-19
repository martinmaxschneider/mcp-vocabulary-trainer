#!/usr/bin/env node
/**
 * HTTPS reverse proxy for the local Next.js app (iPhone PWA / service workers).
 * Forwards https://0.0.0.0:4843 → http://127.0.0.1:4810
 */
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certDir = path.join(root, "data", "certs");
const certFile = path.join(certDir, "local.pem");
const keyFile = path.join(certDir, "local-key.pem");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.production")),
};

const listenPort = Number(
  process.env.HTTPS_PORT || fileEnv.HTTPS_PORT || 4843,
);
const targetPort = Number(process.env.PORT || fileEnv.PORT || 4810);
const targetHost = "127.0.0.1";

if (!existsSync(certFile) || !existsSync(keyFile)) {
  console.error(
    "[https-proxy] Missing certificates. Run `npm run https:setup` first.",
  );
  console.error(`  expected: ${certFile}`);
  process.exit(1);
}

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function filterHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (hopByHop.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

const server = createHttpsServer(
  {
    cert: readFileSync(certFile),
    key: readFileSync(keyFile),
  },
  (req, res) => {
    const proxy = httpRequest(
      {
        hostname: targetHost,
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: {
          ...filterHeaders(req.headers),
          host: `${targetHost}:${targetPort}`,
          "x-forwarded-proto": "https",
          "x-forwarded-host": req.headers.host ?? "",
        },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", (error) => {
      console.error("[https-proxy] upstream error:", error.message);
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end("Bad gateway — is the app running on port " + targetPort + "?");
    });
    req.pipe(proxy);
  },
);

server.on("upgrade", (req, socket, head) => {
  const proxy = httpRequest({
    hostname: targetHost,
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${targetHost}:${targetPort}`,
    },
  });
  proxy.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${upstreamRes.statusCode} Switching Protocols`];
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${key}: ${item}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length) upstreamSocket.write(upstreamHead);
    if (head.length) socket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  proxy.on("error", () => {
    socket.destroy();
  });
  proxy.end();
});

server.on("error", (error) => {
  console.error("[https-proxy]", error.message);
  process.exit(1);
});

server.listen(listenPort, "0.0.0.0", () => {
  const hostnamesFile = path.join(certDir, "hostnames.txt");
  const names = existsSync(hostnamesFile)
    ? readFileSync(hostnamesFile, "utf8").split("\n").filter(Boolean)
    : ["localhost"];
  console.log(
    `[https-proxy] https://0.0.0.0:${listenPort} → http://${targetHost}:${targetPort}`,
  );
  for (const name of names) {
    if (name === "127.0.0.1" || name === "localhost") continue;
    console.log(`  https://${name}:${listenPort}`);
  }
  console.log(`  https://localhost:${listenPort}`);
});
