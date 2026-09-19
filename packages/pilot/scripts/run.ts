import { runPilot } from "../src/runner.js";
import { getPilotDataDir } from "../src/paths.js";
import { flag } from "../src/cli.js";

/**
 * Generic pilot runner (not Aurora/Maya/Dan-bound):
 *   intake project (optional) → load opt-in humans → match → merkle/manifest inputs
 *
 *   npm run pilot:run -- --brief packages/pilot/fixtures/briefs/helios.brief.json
 *   npm run pilot:run -- --project prj_helios_mesh
 */
const brief = flag("--brief");
const projectId = flag("--project");
if (brief === undefined && projectId === undefined) {
  throw new Error("pass --brief <file> or --project <project_id>");
}

const result = runPilot({
  dataDir: getPilotDataDir(flag("--data-dir")),
  briefFile: brief,
  projectId,
  totalAmount: flag("--total", "10000"),
});

console.log(`project:        ${result.inputs.project_id}`);
console.log(`passport:       ${result.inputs.passport_status}`);
console.log(`distribution:   ${result.inputs.distribution_id}`);
console.log(`matches:        ${result.inputs.matches.length}`);
for (const m of result.inputs.matches) {
  console.log(`  ${m.human_id}  score=${m.match_score}  ${m.match_reasons[0]}`);
}
console.log(`allocations:    ${result.inputs.allocations.map((a) => `${a.human_id}:${a.amount}`).join("  ")}`);
console.log(`merkle root:    ${result.inputs.merkle.root}`);
console.log(`manifest hash:  ${result.inputs.manifest_hash}`);
console.log(`wrote:          ${result.outputFile}`);
console.log("off-chain inputs are ready for the existing merkle / demo:prepare ix sequence (generic, not Aurora-bound).");
