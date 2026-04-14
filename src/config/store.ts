import { mkdir, rename, copyFile } from "fs/promises";
import { dirname } from "path";
import { PulseConfigSchema, defaultConfig, type PulseConfig } from "./schema.ts";
import { paths } from "../core/paths.ts";

/**
 * Tracks whether the last loadConfig call fell back to defaults because the
 * existing file on disk could not be parsed. When true, saveConfig refuses
 * to write — otherwise we would silently clobber the user's real config
 * with defaults, which was reported as a data-loss bug.
 *
 * Missing-file fallback does NOT set this flag: writing defaults to a
 * fresh install is expected behaviour.
 */
let loadFellBackToDefaults = false;

export async function loadConfig(): Promise<PulseConfig> {
  const file = Bun.file(paths.configFile());
  if (!(await file.exists())) {
    loadFellBackToDefaults = false;
    return defaultConfig;
  }
  try {
    const raw = await file.json();
    const parsed = PulseConfigSchema.safeParse(raw);
    if (parsed.success) {
      loadFellBackToDefaults = false;
      return parsed.data;
    }
    loadFellBackToDefaults = true;
    return defaultConfig;
  } catch {
    loadFellBackToDefaults = true;
    return defaultConfig;
  }
}

export async function saveConfig(config: PulseConfig): Promise<void> {
  if (loadFellBackToDefaults) {
    throw new Error(
      "refusing to save: existing config at " +
        paths.configFile() +
        " could not be parsed. Fix the file manually or delete it to start fresh.",
    );
  }
  const validated = PulseConfigSchema.parse(config);
  const filePath = paths.configFile();
  await mkdir(dirname(filePath), { recursive: true });
  // Best-effort backup: copy the previous file to .bak before overwriting,
  // so a bad save can always be rolled back by hand.
  try {
    await copyFile(filePath, `${filePath}.bak`);
  } catch {
    // original may not exist yet — that's fine.
  }
  const tmp = `${filePath}.${process.pid}.tmp`;
  await Bun.write(tmp, JSON.stringify(validated, null, 2));
  await rename(tmp, filePath);
}
