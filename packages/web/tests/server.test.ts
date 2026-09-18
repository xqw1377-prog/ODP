import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { createDemoServer } from "../src/server.js";

/** Smoke: the demo server serves the 4 routes and real-pipeline API data. */

describe("demo server smoke", () => {
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
});
