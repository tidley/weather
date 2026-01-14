import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^\/+/, "");
  const filePath = path.join(rootDir, safePath || "index.html");

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      return serveStatic(req, res, path.join(safePath, "index.html"));
    }
    const ext = path.extname(filePath);
    const contentType = contentTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    sendText(res, 404, "Not found");
  }
}

async function handleRssProxy(req, res, url) {
  const target = url.searchParams.get("url");
  if (!target) {
    return sendJson(res, 400, { error: "Missing url parameter." });
  }

  try {
    const response = await fetch(target, {
      headers: { "User-Agent": "local-weather-proxy" },
    });
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: `Upstream error: ${response.status}`,
      });
    }
    const body = await response.text();
    res.writeHead(200, {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=300",
    });
    res.end(body);
  } catch (error) {
    sendJson(res, 502, { error: "Failed to fetch upstream." });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/rss") {
    return handleRssProxy(req, res, url);
  }

  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
