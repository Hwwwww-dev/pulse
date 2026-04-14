import { useState, useEffect, useCallback } from "react";
import { loadConfig, saveConfig } from "../../config/store.ts";
import type { PulseConfig } from "../../config/schema.ts";
import { defaultConfig } from "../../config/schema.ts";

export interface UseConfig {
  config: PulseConfig;
  setConfig: (next: PulseConfig) => void;
  save: () => Promise<void>;
  reload: () => Promise<void>;
  dirty: boolean;
}

export function useConfig(): UseConfig {
  const [config, setConfig] = useState<PulseConfig>(defaultConfig);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      setDirty(false);
    });
  }, []);

  const save = useCallback(async () => {
    await saveConfig(config);
    setDirty(false);
  }, [config]);

  const reload = useCallback(async () => {
    const c = await loadConfig();
    setConfig(c);
    setDirty(false);
  }, []);

  return {
    config,
    setConfig: (next: PulseConfig) => {
      setConfig(next);
      setDirty(true);
    },
    save,
    reload,
    dirty,
  };
}
