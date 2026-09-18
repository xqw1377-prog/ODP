import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Matching Engine's own input contract (P0-3). Declares what kind of early
 * humans this project is looking for RIGHT NOW — an intent, not paid
 * targeting. Deliberately does NOT touch the frozen G1 domain schemas.
 */
export const ProjectMatchIntentSchema = z
  .object({
    project_id: z.string().min(1),
    target_tags: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ProjectMatchIntent = z.infer<typeof ProjectMatchIntentSchema>;

export function loadMatchIntent(file: string): ProjectMatchIntent {
  return ProjectMatchIntentSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function loadMatchIntents(dir: string): ProjectMatchIntent[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".intent.json"))
    .sort()
    .map((f) => loadMatchIntent(path.join(dir, f)));
}
