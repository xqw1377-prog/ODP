import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PILOT_FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));

export function tempPilotDir(label = "odp-pilot-"): string {
  return mkdtempSync(path.join(tmpdir(), label));
}

export const HELIOS_BRIEF = path.join(PILOT_FIXTURES, "briefs", "helios.brief.json");
export const HUMAN_INTAKES = [
  path.join(PILOT_FIXTURES, "humans", "hum_pilot_ada.intake.json"),
  path.join(PILOT_FIXTURES, "humans", "hum_pilot_ben.intake.json"),
  path.join(PILOT_FIXTURES, "humans", "hum_pilot_cy.intake.json"),
];
