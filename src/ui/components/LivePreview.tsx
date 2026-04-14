import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { PulseConfig, Item } from "../../config/schema.ts";
import type { PulseSnapshot } from "../../core/types.ts";
import { renderSafe } from "../../render/engine.ts";
import {
  setCustomCommandPreview,
  subscribePreviewRefresh,
  refreshCommandPreview,
} from "../../render/items/customCommand.ts";

export interface LivePreviewProps {
  snapshot: PulseSnapshot;
  config: PulseConfig;
}

// Collect every custom_command item in the config with its command string
// and per-item timeout, so the debounced effect can fan out the spawns.
function collectCustomCommands(config: PulseConfig): ReadonlyArray<{ cmd: string; timeout: number }> {
  const out: Array<{ cmd: string; timeout: number }> = [];
  for (const line of config.lines) {
    for (const item of line.items as Item[]) {
      if (item.type !== "custom_command") continue;
      const cmd = item.options?.command;
      if (!cmd) continue;
      const timeout = item.options?.command_timeout_ms ?? 1000;
      out.push({ cmd, timeout });
    }
  }
  return out;
}

export function LivePreview({ snapshot, config }: LivePreviewProps): React.ReactElement {
  // Force-refresh counter — flipped when the async preview refresh lands, so
  // React re-renders and picks up the fresh stdout from the module cache.
  const [, forceTick] = useState<number>(0);

  useEffect(() => {
    const unsub = subscribePreviewRefresh(() => forceTick((t) => t + 1));
    return unsub;
  }, []);

  // Debounced async execution: on every config/snapshot change, cancel the
  // pending timer and schedule a new one 400ms out. When it fires, spawn
  // each custom_command item asynchronously (non-blocking). Results are
  // cached in the customCommand module and trigger a re-render via the
  // subscription above.
  useEffect(() => {
    const commands = collectCustomCommands(config);
    if (commands.length === 0) return;
    const timer = setTimeout(() => {
      for (const { cmd, timeout } of commands) {
        refreshCommandPreview(cmd, snapshot, timeout);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [config, snapshot]);

  // Sync render path: preview mode is ON so custom_command renderers read
  // from the preview cache (filled asynchronously) instead of shelling out.
  setCustomCommandPreview(true);
  const text = renderSafe(snapshot, config);
  setCustomCommandPreview(false);
  return React.createElement(
    Box,
    { borderStyle: "round", paddingX: 1, flexDirection: "column" },
    React.createElement(Text, { dimColor: true }, "preview"),
    ...text.split("\n").map((l, i) => React.createElement(Text, { key: i }, l)),
  );
}
