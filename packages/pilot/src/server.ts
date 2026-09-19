import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection } from "@solana/web3.js";
import { createChallenge, verifyEnrollmentSignature, CONSENT_POLICY_VERSION } from "./challenge.js";
import { registerHuman, realHumanCount, eligiblePool } from "./intake-human.js";
import { submitProject } from "./intake-project.js";
import { decideClaim, generatePassportForProject, reviewOnlyClaims } from "./verify-claims.js";
import { planRun } from "./runner.js";
import { assertClaimable, buildClaimTransaction, fetchBlockhash, verifyClaimOnchain, recordConfirmedClaim } from "./claim-tx.js";
import { PilotStore, defaultPilotDir } from "./store.js";
import { INTEREST_VOCABULARY } from "./vocabulary.js";

/* Pilot backend (P1-C). Public: human/project intake, claim flow.
   Private: operator evidence decisions, run planning (ODP_OPERATOR_TOKEN,
   fail-closed when unset). Aggregates only on public state endpoints —
   handle↔wallet relations never leave the private store. */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) reject(new Error("body too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function jsonBody<T>(req: IncomingMessage): Promise<T> {
  return JSON.parse(await readBody(req)) as T;
}

const PAGES = new Set(["/", "/project", "/console", "/claim"]);

export function createPilotServer(options: { dataDir?: string } = {}): Server {
  const store = new PilotStore(options.dataDir ?? defaultPilotDir());
  const publicDir = normalize(join(fileURLToPath(import.meta.url), "..", "..", "public"));

  function operatorAuthorized(req: IncomingMessage): boolean {
    const expected = process.env.ODP_OPERATOR_TOKEN;
    if (expected === undefined || expected.length < 8) return false; // fail closed
    return req.headers["x-operator-token"] === expected;
  }

  const server: Server = createServer(async (req, res) => {
    try {
      const url = (req.url ?? "/").split("?")[0]!;
      const query = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");

      // ── static pages ─────────────────────────────────────────────────
      if (req.method === "GET") {
        const rel =
          url === "/" ? "index.html" : PAGES.has(url) ? `${url.slice(1)}.html` : url.slice(1);
        const allowed =
          PAGES.has(url) || rel === "style.css" || rel === "pilot-app.js" || rel.startsWith("vendor/");
        if (allowed) {
          const target = normalize(join(publicDir, rel));
          if (!target.startsWith(publicDir)) return json(res, 404, { error: "not found" });
          try {
            const body = readFileSync(target);
            const ext = rel.endsWith(".css") ? ".css" : rel.endsWith(".js") ? ".js" : ".html";
            res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
            return res.end(body);
          } catch {
            return json(res, 404, { error: "not found" });
          }
        }
      }

      // ── public pilot API ─────────────────────────────────────────────
      if (req.method === "GET" && url === "/api/pilot/meta") {
        return json(res, 200, { vocabulary: INTEREST_VOCABULARY, consent_version: CONSENT_POLICY_VERSION });
      }

      if (req.method === "GET" && url === "/api/pilot/challenge") {
        const wallet = query.get("wallet") ?? "";
        try {
          const challenge = createChallenge(store, wallet);
          return json(res, 200, challenge);
        } catch (err) {
          return json(res, 400, { error: (err as Error).message });
        }
      }

      if (req.method === "POST" && url === "/api/pilot/humans") {
        const body = await jsonBody<Record<string, unknown>>(req);
        const result = registerHuman(store, {
          wallet: String(body.wallet ?? ""),
          nonce: String(body.nonce ?? ""),
          signature: String(body.signature ?? ""),
          x_handle: String(body.x_handle ?? ""),
          interests: (body.interests as string[]) ?? [],
          consent_accepted: body.consent_accepted === true,
        });
        return result.ok
          ? json(res, 201, { human_id: result.human.human_id, status: result.human.status })
          : json(res, 400, { error: result.reason });
      }

      if (req.method === "GET" && url === "/api/pilot/state") {
        const runs = store.runs.list().map((r) => ({
          run_id: r.run_id,
          project_id: r.project_id,
          status: r.status,
          recipient_count: r.recipient_count,
          claimed: Object.keys(r.claims).length,
        }));
        // aggregates only — no handles, no wallets, no claims by human
        return json(res, 200, {
          real_humans: realHumanCount(store),
          eligible: eligiblePool(store).length,
          runs,
        });
      }

      if (req.method === "POST" && url === "/api/pilot/projects") {
        const body = await jsonBody<Record<string, unknown>>(req);
        const result = submitProject(store, {
          name: String(body.name ?? ""),
          symbol: String(body.symbol ?? ""),
          website: String(body.website ?? ""),
          x_account: String(body.x_account ?? ""),
          github: (body.github as string | null) ?? null,
          token_address: (body.token_address as string | null) ?? null,
          wallet: String(body.wallet ?? ""),
          intent_text: String(body.intent_text ?? ""),
          target_tags: (body.target_tags as string[]) ?? [],
          discovery_source: (body.discovery_source as "social" | "onchain" | "developer" | "capital" | "network") ?? "network",
          claims: (body.claims as {
            dimension: "TEAM" | "PRODUCT" | "CODE" | "TOKEN" | "ONCHAIN" | "SOCIAL";
            statement: string;
            url?: string | null;
            proposed_findings: never[];
          }[]) ?? [],
        });
        return result.ok
          ? json(res, 201, { project_id: result.project.project_id, claims: result.claims.length })
          : json(res, 400, { error: result.reason });
      }

      // ── claim flow (self-custody) ────────────────────────────────────
      if (req.method === "GET" && url === "/api/pilot/claim/status") {
        const run_id = query.get("run_id") ?? "";
        const wallet = query.get("wallet") ?? "";
        const run = store.runs.get(run_id);
        if (run === null) return json(res, 404, { error: "run not found" });
        const result = assertClaimable(store, run, wallet);
        return result.ok
          ? json(res, 200, { claimable: true, amount: result.allocation.amount })
          : json(res, 409, { claimable: false, error: result.reason });
      }

      if (req.method === "POST" && url === "/api/pilot/claim/build") {
        const body = await jsonBody<{ run_id?: string; wallet?: string }>(req);
        const run = store.runs.get(body.run_id ?? "");
        if (run === null) return json(res, 404, { error: "run not found" });
        const guard = assertClaimable(store, run, body.wallet ?? "");
        if (!guard.ok) return json(res, 409, { error: guard.reason });
        try {
          const { rpc } = run.onchain!;
          const bh = await fetchBlockhash(rpc);
          const built = buildClaimTransaction({ run, wallet: body.wallet!, ...bh });
          return json(res, 200, built);
        } catch (err) {
          return json(res, 400, { error: (err as Error).message });
        }
      }

      if (req.method === "POST" && url === "/api/pilot/claim/confirm") {
        const body = await jsonBody<{ run_id?: string; wallet?: string; signature?: string; receipt_pda?: string }>(req);
        const run = store.runs.get(body.run_id ?? "");
        if (run === null) return json(res, 404, { error: "run not found" });
        // machine gate: browser assertions are verified against devnet
        const verified = await verifyClaimOnchain(new Connection(run.onchain?.rpc ?? ""), {
          run,
          wallet: body.wallet ?? "",
          signature: body.signature ?? "",
          receiptPda: body.receipt_pda ?? "",
        });
        if (!verified.ok) return json(res, 409, { error: verified.reason });
        const human = store.humans.list().find((h) => h.wallet === body.wallet);
        if (human === undefined) return json(res, 404, { error: "human not found" });
        recordConfirmedClaim(store, run, human.human_id, {
          claim_tx: body.signature!,
          receipt_pda: body.receipt_pda!,
        });
        return json(res, 200, { claimed: true, receipt_pda: body.receipt_pda });
      }

      if (req.method === "POST" && url === "/api/pilot/feedback") {
        const body = await jsonBody<{ run_id?: string; human_id?: string; score?: number; text?: string }>(req);
        const run = store.runs.get(body.run_id ?? "");
        if (run === null) return json(res, 404, { error: "run not found" });
        const score = Number(body.score);
        if (!Number.isInteger(score) || score < 1 || score > 5) return json(res, 400, { error: "score must be 1-5" });
        if (!body.text || body.text.length < 1) return json(res, 400, { error: "feedback text required" });
        if (!body.human_id || !store.humans.get(body.human_id)) return json(res, 400, { error: "unknown human_id" });
        store.runs.save({
          ...run,
          feedback: [
            ...run.feedback,
            { human_id: String(body.human_id), score, text: String(body.text), at: new Date().toISOString() },
          ],
        });
        return json(res, 200, { recorded: true });
      }

      // ── operator API (token-gated, fail-closed) ──────────────────────
      const isOperatorRoute = url.startsWith("/api/operator/");
      if (isOperatorRoute) {
        if (!operatorAuthorized(req)) {
          return json(res, process.env.ODP_OPERATOR_TOKEN === undefined ? 503 : 403, {
            error:
              process.env.ODP_OPERATOR_TOKEN === undefined
                ? "operator auth not configured on this server"
                : "operator token required",
          });
        }
        if (req.method === "GET" && url === "/api/operator/claims") {
          const project_id = query.get("project_id") ?? "";
          return json(res, 200, {
            claims: store.getClaims(project_id),
            review_only: reviewOnlyClaims(store, project_id),
          });
        }
        if (req.method === "POST" && url === "/api/operator/claim/decide") {
          const body = await jsonBody<{ project_id?: string; claim_id?: string; decision?: string; verifier?: string; note?: string }>(req);
          try {
            const decided = decideClaim(store, body.project_id ?? "", body.claim_id ?? "", {
              verifier: body.verifier ?? "",
              decision: body.decision === "REJECTED" ? "REJECTED" : "VERIFIED",
              note: body.note,
            });
            return json(res, 200, { claim_id: decided.claim_id, status: decided.status });
          } catch (err) {
            return json(res, 409, { error: (err as Error).message });
          }
        }
        if (req.method === "POST" && url === "/api/operator/passport") {
          const body = await jsonBody<{ project_id?: string }>(req);
          try {
            const passport = generatePassportForProject(store, body.project_id ?? "");
            return json(res, 200, { status: passport.status, reasons: passport.reasons });
          } catch (err) {
            return json(res, 409, { error: (err as Error).message });
          }
        }
        if (req.method === "POST" && url === "/api/operator/run") {
          const body = await jsonBody<{ project_id?: string; total_amount?: string; recipient_count?: number }>(req);
          const planned = planRun(store, {
            project_id: body.project_id ?? "",
            total_amount: body.total_amount ?? "",
            recipient_count: Number(body.recipient_count),
          });
          return planned.ok
            ? json(res, 201, { run_id: planned.run.run_id, status: planned.run.status, allocations: planned.run.allocations.length, root: planned.run.root })
            : json(res, 409, { error: planned.reason });
        }
        return json(res, 404, { error: "not found" });
      }

      return json(res, 404, { error: "not found" });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  });

  return server;
}

const IS_MAIN = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (IS_MAIN) {
  const PORT = Number(process.env.ODP_PILOT_PORT ?? 3200);
  createPilotServer().listen(PORT, "127.0.0.1", () => {
    console.log(`ODP pilot backend: http://127.0.0.1:${PORT}/`);
  });
}
