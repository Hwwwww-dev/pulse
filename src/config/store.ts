import { mkdir, rename } from "fs/promises";
import { dirname } from "path";
import { PulseConfigSchema, defaultConfig, type PulseConfig } from "./schema.ts";
import { paths } from "../core/paths.ts";

export async function loadConfig(): Promise<PulseConfig> {
  const file = Bun.file(paths.configFile());
  if (!(await file.exists())) return defaultConfig;
  try {
    const raw = await file.json();
    const parsed = PulseConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : defaultConfig;
  } catch {
    return defaultConfig;
  }
}

export async function saveConfig(config: PulseConfig): Promise<void> {
  const validated = PulseConfigSchema.parse(config);
  const filePath = paths.configFile();
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await Bun.write(tmp, JSON.stringify(validated, null, 2));
  await rename(tmp, filePath);
}
