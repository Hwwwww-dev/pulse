import { join } from "node:path";
import { rm, mkdir } from "node:fs/promises";

const TEST_HOME = join(process.cwd(), ".pulse", "dev");
process.env.PULSE_HOME = TEST_HOME;
await mkdir(TEST_HOME, { recursive: true });

// rm imported per task spec; not used at top-level (tests clear per-test).
void rm;
