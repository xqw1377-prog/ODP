import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import { createDemoServer, handleDemoRequest, requestPath, resolveListenHost, resolveListenPort } from "../src/server.js";

/** Smoke: the demo server serves the 4 routes and real-pipeline API data. */

describe("demo server smoke", { concurrency: false }, () => {
  const server = createDemoServer();
  const listening = new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = new Promise<number>((resolve) =>
    server.on("listening", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr !== null ? addr.port : 0);
    }),
  );
  after(() => new Promise((resolve) => server.close(() => resolve(undefined))));

  it("serves the SPA shell on all four routes", async () => {
    await listening;
    const p = await port;
    for (const route of ["/radar", "/project/aurora", "/distribution/aurora", "/claim/maya"]) {
      const res = await fetch(`http://127.0.0.1:${p}${route}`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes("Open Distribution Protocol"), route);
    }
  });

  it("/api/radar returns the real three rulings", async () => {
    const p = await port;
    const res = await fetch(`http://127.0.0.1:${p}/api/radar`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { radar: Array<{ status: string }> };
    const statuses = body.radar.map((r) => r.status).sort();
    assert.deepEqual(statuses, ["ALLOW", "REJECT", "WATCH"]);
  });

  it("/api/project/aurora returns a passport with six dims and derived ALLOW", async () => {
    const p = await port;
    const body = (await (await fetch(`http://127.0.0.1:${p}/api/project/aurora`)).json()) as {
      passport: { status: string; dims: Record<string, unknown> };
    };
    assert.equal(body.passport.status, "ALLOW");
    assert.equal(Object.keys(body.passport.dims).length, 6);
  });

  it("/api/distribution/aurora returns computed matches and allocations", async () => {
    const p = await port;
    const body = (await (await fetch(`http://127.0.0.1:${p}/api/distribution/aurora`)).json()) as {
      matches: Array<{ human_id: string; score: number }>;
      allocations: Array<{ amount: string }>;
    };
    assert.deepEqual(body.matches.map((m) => m.human_id), ["hum_maya", "hum_dev_dan", "hum_sib"]);
    assert.deepEqual(body.allocations.map((a) => a.amount), ["5000", "5000"]);
  });

  it("unknown paths 404", async () => {
    const p = await port;
    const res = await fetch(`http://127.0.0.1:${p}/nope`);
    assert.equal(res.status, 404);
  });

  it("serves Early Humans V0 boarding door without changing demo routes", async () => {
    await listening;
    const p = await port;
    const res = await fetch(`http://127.0.0.1:${p}/early-humans`);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("Open Distribution Protocol"));
    const tags = await (await fetch(`http://127.0.0.1:${p}/api/pilot/tags`)).json() as {
      slogan: string;
      sub: string;
      tags: Array<{ slug: string }>;
    };
    assert.equal(tags.slogan, "Stop hunting. Get discovered.");
    assert.match(tags.sub, /Connect your X and Solana wallet/);
    assert.equal(tags.tags.length, 10);
    const poolRes = await fetch(`http://127.0.0.1:${p}/api/pilot/pool`);
    assert.equal(poolRes.status, 200);
    const pool = (await poolRes.json()) as { target: number; stretch_hold: number };
    assert.equal(pool.target, 30);
    assert.equal(pool.stretch_hold, 1000);
  });

  it("POST /api/pilot/humans persists into ODP_PILOT_DATA_DIR", async () => {
    const prev = process.env.ODP_PILOT_DATA_DIR;
    const dataDir = path.join(tmpdir(), `odp-web-pilot-${process.pid}-${Date.now()}`);
    process.env.ODP_PILOT_DATA_DIR = dataDir;
    try {
      const p = await port;
      const res = await fetch(`http://127.0.0.1:${p}/api/pilot/humans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x_handle: "@vercel_pilot",
          wallet: "7ZBKhXPypo5nW7F8oCdmEgK8zAcbGSm1X4GEtnhzUHhp",
          interest_tags: ["Solana", "DePIN", "Early Adopter"],
          x_stub_acknowledged: true,
          consent: true,
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { slogan: string; x_id: string; eligible: boolean };
      assert.equal(body.slogan, "Stop hunting. Get discovered.");
      assert.equal(body.x_id, "@vercel_pilot");
      assert.equal(body.eligible, true);
    } finally {
      if (prev === undefined) delete process.env.ODP_PILOT_DATA_DIR;
      else process.env.ODP_PILOT_DATA_DIR = prev;
    }
  });
});

describe("Vercel listen helpers", { concurrency: false }, () => {
  const keys = ["PORT", "ODP_PORT", "VERCEL", "ODP_LISTEN_HOST"] as const;
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  after(() => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  it("binds 0.0.0.0 when PORT or VERCEL is set, else 127.0.0.1", () => {
    delete process.env.PORT;
    delete process.env.VERCEL;
    delete process.env.ODP_LISTEN_HOST;
    assert.equal(resolveListenHost(), "127.0.0.1");
    process.env.PORT = "3000";
    assert.equal(resolveListenHost(), "0.0.0.0");
    delete process.env.PORT;
    process.env.VERCEL = "1";
    assert.equal(resolveListenHost(), "0.0.0.0");
  });

  it("prefers process.env.PORT over ODP_PORT", () => {
    process.env.PORT = "8080";
    process.env.ODP_PORT = "3000";
    assert.equal(resolveListenPort(), 8080);
  });

  it("recovers the public path from Vercel rewrite query", () => {
    assert.equal(requestPath({ url: "/api?odp_path=early-humans" } as never), "/early-humans");
    assert.equal(requestPath({ url: "/api?odp_path=api/pilot/tags" } as never), "/api/pilot/tags");
    assert.equal(requestPath({ url: "/api/pilot/tags" } as never), "/api/pilot/tags");
    assert.equal(typeof handleDemoRequest, "function");
  });
});

