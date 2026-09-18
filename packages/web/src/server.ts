import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeDemoSnapshot, mayaWhyYou, HUMAN_DISPLAY, loadDemoState } from "./demo-data.js";
import { executeMayaClaim, readMayaClaimStatus } from "./claim.js";

/**
 * ODP demo server (P0-5). Serves the 4-scene UI and a small JSON API backed
 * by the REAL pipelines. Claim signing happens HERE (demo wallet mode) —
 * private keys never reach the browser.
 */

const PORT = Number(process.env.ODP_PORT ?? 3000);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
const ROUTES = new Set(["/radar", "/project/aurora", "/distribution/aurora", "/claim/maya"]);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk as string;
  return body;
}

export function createDemoServer() {
  const snapshot = computeDemoSnapshot();

  return createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0]!;
    try {
      // ── API (all data from the real pipeline snapshot) ──────────────
      if (url === "/api/radar") {
        return json(res, 200, {
          radar: snapshot.radar.map((r) => ({
            project_id: r.project_id,
            name: r.name,
            symbol: r.symbol,
            status: r.status,
            reason: r.reasons[0],
          })),
        });
      }

      if (url === "/api/project/aurora") {
        return json(res, 200, {
          candidate: snapshot.auroraCandidate,
          passport: snapshot.auroraPassport,
        });
      }

      if (url === "/api/distribution/aurora") {
        const state = loadDemoState();
        return json(res, 200, {
          matches: snapshot.matches.map((m) => {
            const human = snapshot.humans.find((h) => h.human_id === m.human_id)!;
            return {
              human_id: m.human_id,
              display: HUMAN_DISPLAY[m.human_id] ?? m.human_id,
              score: m.match_score,
              reasons: m.match_reasons,
              blocked: m.match_score === 0,
              risk_flags: human.risk_flags,
              interest_tags: human.interest_tags,
            };
          }),
          allocations: snapshot.allocations.map((a) => ({
            display: HUMAN_DISPLAY[a.human_id] ?? a.human_id,
            amount: a.amount,
            human_id: a.human_id,
          })),
          onchain: state,
        });
      }

      if (url === "/api/claim/maya" && req.method === "GET") {
        const state = loadDemoState();
        if (state === null) return json(res, 503, { error: "no demo distribution — run npm run demo:prepare" });
        const status = await readMayaClaimStatus(state);
        return json(res, 200, {
          why: mayaWhyYou(snapshot.matches),
          amount: state.maya_amount,
          distribution_id: state.distribution_id,
          ...status,
        });
      }

      if (url === "/api/claim/maya" && req.method === "POST") {
        const state = loadDemoState();
        if (state === null) return json(res, 503, { error: "no demo distribution — run npm run demo:prepare" });
        const status = await readMayaClaimStatus(state);
        if (status.claimed) {
          console.log(`[${new Date().toISOString()}] POST /api/claim/maya -> 409 already-claimed dist=${state.distribution_id}`);
          return json(res, 409, { error: "already claimed", receipt_pda: status.receipt_pda });
        }
        if (!status.distribution_live) {
          console.log(`[${new Date().toISOString()}] POST /api/claim/maya -> 409 not-live dist=${state.distribution_id}`);
          return json(res, 409, { error: "distribution is not LIVE" });
        }
        const result = await executeMayaClaim(state);
        console.log(
          `[${new Date().toISOString()}] POST /api/claim/maya -> 200 dist=${state.distribution_id} ` +
            `sig=${result.signature} receipt=${result.receipt_pda} maya_balance=${result.maya_balance}`,
        );
        return json(res, 200, result);
      }

      // ── static + SPA routes ──────────────────────────────────────────
      if (url.startsWith("/api/")) return json(res, 404, { error: "not found" });

      let file = url === "/" ? "/radar" : url;
      if (ROUTES.has(file)) file = "/index.html";
      const target = path.join(PUBLIC_DIR, path.normalize(file).replace(/^([.][.][/\\])+/, ""));
      if (existsSync(target) && target.startsWith(PUBLIC_DIR)) {
        const ext = path.extname(target) as keyof typeof MIME;
        res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
        return res.end(readFileSync(target));
      }
      return json(res, 404, { error: "not found" });
    } catch (err) {
      return json(res, 500, { error: String(err) });
    }
  });
}

if (process.argv[1]?.endsWith("server.ts")) {
  const server = createDemoServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`ODP demo: http://127.0.0.1:${PORT}/radar`);
  });
}
