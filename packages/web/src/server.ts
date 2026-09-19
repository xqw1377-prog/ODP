import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeDemoSnapshot, mayaWhyYou, HUMAN_DISPLAY, loadDemoState } from "./demo-data.js";
import type { DemoSnapshot } from "./demo-data.js";
import {
  EARLY_HUMAN_TAGS,
  LANDING_SUB,
  SLOGAN,
  getPilotDataDir,
  intakeProject,
  persistProjectIntake,
  openPassportEngine,
  loadPersistedIntent,
} from "@odp/pilot";

/**
 * ODP demo server (P0-5). Serves the 4-scene UI and a small JSON API backed
 * by the REAL pipelines. Claim signing happens HERE (demo wallet mode) —
 * private keys never reach the browser.
 *
 * Vercel (LAMBDAS): export handleDemoRequest — do not listen(); Fluid/Lambda
 * never connects to a TCP port. Local: `npm run dev` → tsx this file.
 */

const ROUTES = new Set(["/radar", "/project/aurora", "/distribution/aurora", "/claim/maya"]);
const PUBLIC_INTAKE_HOLD = "PUBLIC INTAKE = HOLD — wallet verification required";

/** Vercel / PaaS inject PORT. Local `npm run dev` keeps 127.0.0.1:ODP_PORT. */
export function resolveListenPort(): number {
  return Number(process.env.PORT ?? process.env.ODP_PORT ?? 3000);
}

export function resolveListenHost(): string {
  if (process.env.ODP_LISTEN_HOST) return process.env.ODP_LISTEN_HOST;
  if (process.env.VERCEL || process.env.PORT) return "0.0.0.0";
  return "127.0.0.1";
}

export function listenDemoServer(server: Server): Server {
  const port = resolveListenPort();
  const host = resolveListenHost();
  server.listen(port, host, () => {
    const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
    console.log(`ODP demo: http://${shown}:${port}/radar`);
  });
  return server;
}

function isDirectServerEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

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

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk as string;
  return body;
}

let cachedSnapshot: DemoSnapshot | null = null;
let wipedEphemeralPilot = false;

/** Drop leftover /tmp intakes (e.g. hum_vercel_live) on each Vercel isolate. */
export function wipeEphemeralPilotStore(): void {
  if (wipedEphemeralPilot) return;
  wipedEphemeralPilot = true;
  if (process.env.VERCEL !== "1" && process.env.VERCEL !== "true") return;
  try {
    rmSync(getPilotDataDir(), { recursive: true, force: true });
  } catch {
    /* empty */
  }
}

function getDemoSnapshot(): DemoSnapshot {
  if (cachedSnapshot === null) cachedSnapshot = computeDemoSnapshot();
  return cachedSnapshot;
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

/** Recover the public path when Vercel rewrites `/(.*)` → `/api?odp_path=$1`. */
export function requestPath(req: IncomingMessage): string {
  const raw = req.url ?? "/";
  try {
    const u = new URL(raw, "http://odp.local");
    const rewritten = u.searchParams.get("odp_path");
    if (rewritten !== null && rewritten.length > 0) {
      return rewritten.startsWith("/") ? rewritten : `/${rewritten}`;
    }
    return u.pathname;
  } catch {
    return raw.split("?")[0] ?? "/";
  }
}

/**
 * Node (req, res) listener — Vercel Functions + local createServer.
 * Early Humans / tags do not touch the Aurora snapshot or Solana.
 */
export async function handleDemoRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  wipeEphemeralPilotStore();
  const url = requestPath(req);
  try {
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
      const { readMayaClaimStatus } = await import("./claim.js");
      const status = await readMayaClaimStatus(state);
      return json(res, 200, {
        why: mayaWhyYou(snapshot.matches),
        amount: state.maya_amount,
        distribution_id: state.distribution_id,
        ...status,
      });
    }

    if (url === "/api/pilot/tags") {
      return json(res, 200, { slogan: SLOGAN, sub: LANDING_SUB, tags: EARLY_HUMAN_TAGS });
    }

    if (url === "/api/pilot/pool" || url === "/api/pilot/pool.txt" || (url === "/api/pilot/humans" && req.method === "GET")) {
      return json(res, 410, { error: PUBLIC_INTAKE_HOLD, dump: "disabled" });
    }

    if (url === "/api/pilot/humans" && req.method === "POST") {
      return json(res, 403, { error: PUBLIC_INTAKE_HOLD });
    }

    if (url === "/api/pilot/projects" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const taken = intakeProject(body);
      persistProjectIntake(taken, getPilotDataDir());
      return json(res, 200, {
        project_id: taken.candidate.project_id,
        name: taken.candidate.name,
        passport_status: taken.passport.status,
        reasons: taken.passport.reasons,
        intent: taken.intent,
      });
    }

    if (url.startsWith("/api/pilot/projects/") && req.method === "GET") {
      const projectId = url.slice("/api/pilot/projects/".length);
      const detail = openPassportEngine(getPilotDataDir()).getProjectPassport(projectId);
      if (detail === null) return json(res, 404, { error: `no pilot project ${projectId}` });
      return json(res, 200, {
        candidate: detail.candidate,
        passport: detail.passport,
        intent: loadPersistedIntent(projectId, getPilotDataDir()),
      });
    }

    if (url === "/api/claim/maya" && req.method === "POST") {
      const state = loadDemoState();
      if (state === null) return json(res, 503, { error: "no demo distribution — run npm run demo:prepare" });
      const { readMayaClaimStatus, executeMayaClaim } = await import("./claim.js");
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

if (isDirectServerEntry() && !process.env.VERCEL) {
  listenDemoServer(createDemoServer());
}
