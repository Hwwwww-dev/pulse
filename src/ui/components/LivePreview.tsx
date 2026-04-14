import React from "react";
import { Box, Text } from "ink";
import type { PulseConfig } from "../../config/schema.ts";
import type { PulseSnapshot } from "../../core/types.ts";
import { renderSafe } from "../../render/engine.ts";

export interface LivePreviewProps {
  snapshot: PulseSnapshot;
  config: PulseConfig;
}

export function LivePreview({ snapshot, config }: LivePreviewProps): React.ReactElement {
  const text = renderSafe(snapshot, config);
  return React.createElement(
    Box,
    { borderStyle: "round", paddingX: 1, flexDirection: "column" },
    React.createElement(Text, { dimColor: true }, "preview"),
    ...text.split("\n").map((l, i) => React.createElement(Text, { key: i }, l)),
  );
}
