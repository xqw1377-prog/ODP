import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ProjectCandidateSchema } from "@odp/domain";
import type { ProjectCandidate } from "@odp/domain";

/**
 * Discovery boundary (P0-2). Real sources — X API, GitHub API, Solana RPC
 * discovery, AI agents — are HOLD; only the fixture source is implemented.
 * Future sources are drop-in implementations of this interface.
 */
export interface DiscoverySource {
  discover(): ProjectCandidate[];
}

/** Reads validated ProjectCandidate fixtures from a directory. */
export class FixtureDiscoverySource implements DiscoverySource {
  constructor(private readonly dir: string) {}

  discover(): ProjectCandidate[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".candidate.json"))
      .sort()
      .map((f) =>
        ProjectCandidateSchema.parse(JSON.parse(readFileSync(path.join(this.dir, f), "utf8"))),
      );
  }
}
