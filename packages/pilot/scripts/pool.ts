import { formatPoolDump, readPilotPool } from "../src/pool.js";
import { getPilotDataDir } from "../src/paths.js";
import { flag } from "../src/cli.js";

const pool = readPilotPool(getPilotDataDir(flag("--data-dir")));
process.stdout.write(formatPoolDump(pool));
