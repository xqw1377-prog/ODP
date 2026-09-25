import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeDemoSnapshot, mayaWhyYou, HUMAN_DISPLAY, loadDemoState, type DemoSnapshot } from "./demo-data.js";
import { executeMayaClaim, readMayaClaimStatus } from "./claim.js";

/**
 * ODP demo server (P0-5). Serves the 4-scene UI and a small JSON API backed
 * by the REAL pipelines. Claim signing happens HERE (demo wallet mode) —
 * private keys never reach the browser.
 *
 * Vercel (LAMBDAS): export handleDemoRequest — do not listen(). Local:
 * `npm run dev` → tsx this file. Public wallet enrollment is Fly-only.
 */

const PORT = Number(process.env.ODP_PORT ?? 3000);
const ROUTES = new Set(["/radar", "/project/aurora", "/distribution/aurora", "/claim/maya"]);
const PUBLIC_INTAKE_HOLD = "PUBLIC INTAKE = HOLD — wallet verification required";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function resolvePublicDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../public"),
    path.join(process.cwd(), "packages/web/public"),
    path.join(process.cwd(), "public"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) return path.resolve(dir);
  }
  return path.resolve(candidates[0]!);
}

/** Recover the public path when Vercel rewrites `/(.*)` → `/api?odp_path=$1`.
    The root rewrite carries an EMPTY odp_path — "" must resolve to "/", not
    fall through to the literal /api function path (SUBMIT-P0-1). */
export function requestPath(req: IncomingMessage): string {
  const raw = req.url ?? "/";
  try {
    const u = new URL(raw, "http://odp.local");
    const rewritten = u.searchParams.get("odp_path");
    if (rewritten !== null) {
      if (rewritten.length === 0) return "/";
      return rewritten.startsWith("/") ? rewritten : `/${rewritten}`;
    }
    return u.pathname;
  } catch {
    return raw.split("?")[0] ?? "/";
  }
}

let cachedSnapshot: DemoSnapshot | null = null;

function getDemoSnapshot(): DemoSnapshot {
  cachedSnapshot ??= computeDemoSnapshot();
  return cachedSnapshot;
}

/**
 * Node (req, res) listener — Vercel Functions + local createServer.
 * /early-humans is a static Front Door and never touches wallet APIs.
 */
export async function handleDemoRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = requestPath(req);
  try {
    // Compliance: Vercel never collects wallets. Enrollment is Fly-only.
    if (url === "/api/pilot/pool" || url === "/api/pilot/pool.txt" || (url === "/api/pilot/humans" && req.method === "GET")) {
      return json(res, 410, { error: PUBLIC_INTAKE_HOLD, dump: "disabled" });
    }
    if ((url === "/api/pilot/humans" || url === "/api/pilot/projects") && req.method === "POST") {
      return json(res, 403, { error: PUBLIC_INTAKE_HOLD });
    }

    if (url === "/api/radar") {
      const snapshot = getDemoSnapshot();
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
      const snapshot = getDemoSnapshot();
      return json(res, 200, {
        candidate: snapshot.auroraCandidate,
        passport: snapshot.auroraPassport,
      });
    }

    if (url === "/api/distribution/aurora") {
      const snapshot = getDemoSnapshot();
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
      const snapshot = getDemoSnapshot();
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

    if (url.startsWith("/api/")) return json(res, 404, { error: "not found" });

    const publicDir = resolvePublicDir();
    let file = url === "/" ? "/radar" : url;
    if (file === "/early-humans") file = "/early-humans.html";
    if (ROUTES.has(file)) file = "/index.html";
    const target = path.join(publicDir, path.normalize(file).replace(/^([.][.][/\\])+/, ""));
    if (existsSync(target) && target.startsWith(publicDir)) {
      const ext = path.extname(target) as keyof typeof MIME;
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(readFileSync(target));
      return;
    }
    return json(res, 404, { error: "not found" });
  } catch (err) {
    return json(res, 500, { error: String(err) });
  }
}

export function createDemoServer() {
  return createServer((req, res) => {
    void handleDemoRequest(req, res);
  });
}

if (process.argv[1]?.endsWith("server.ts") && !process.env.VERCEL) {
  const server = createDemoServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`ODP demo: http://127.0.0.1:${PORT}/radar`);
  });
}
