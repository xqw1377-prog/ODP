import path from "node:path";
import { fileURLToPath } from "node:url";

export const OWN_FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));
/** monorepo-internal dev path: the passport-engine golden fixtures */
export const PASSPORT_FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../passport-engine/fixtures",
);
