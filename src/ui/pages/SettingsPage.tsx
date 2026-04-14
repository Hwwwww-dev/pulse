import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PulseConfig } from "../../config/schema.ts";
import { THEMES } from "../../config/themes.ts";

export interface SettingsPageProps {
  config: PulseConfig;
  onChange: (next: PulseConfig) => void;
}

type FieldKey = "theme" | "default_separator";
const FIELDS: readonly FieldKey[] = ["theme", "default_separator"] as const;

const SEP_PRESETS: readonly string[] = [" ", " | ", " · ", " > ", " / ", "  ", " • "];

function displaySep(s: string): string {
  return s.replace(/ /g, "␣");
}

export function SettingsPage({ config, onChange }: SettingsPageProps): React.ReactElement {
  const [focus, setFocus] = useState<number>(0);
  const activeField = FIELDS[focus] ?? "theme";

  useInput((input, key) => {
    if (key.upArrow) { setFocus((f) => (f - 1 + FIELDS.length) % FIELDS.length); return; }
    if (key.downArrow) { setFocus((f) => (f + 1) % FIELDS.length); return; }

    if (activeField === "theme" && (key.leftArrow || key.rightArrow)) {
      const names = Object.keys(THEMES);
      const idx = names.indexOf(config.theme);
      const safeIdx = idx < 0 ? 0 : idx;
      const nextIdx = key.rightArrow
        ? (safeIdx + 1) % names.length
        : (safeIdx - 1 + names.length) % names.length;
      const next = names[nextIdx];
      if (next && next !== config.theme) onChange({ ...config, theme: next });
      return;
    }

    if (activeField === "default_separator") {
      // ←→ cycles presets; typing characters appends to a custom string;
      // backspace pops the last char (clamped to "").
      if (key.leftArrow || key.rightArrow) {
        const idx = SEP_PRESETS.indexOf(config.default_separator);
        const safeIdx = idx < 0 ? 0 : idx;
        const nextIdx = key.rightArrow
          ? (safeIdx + 1) % SEP_PRESETS.length
          : (safeIdx - 1 + SEP_PRESETS.length) % SEP_PRESETS.length;
        const next = SEP_PRESETS[nextIdx];
        if (next !== undefined) onChange({ ...config, default_separator: next });
        return;
      }
      if (key.backspace || key.delete) {
        onChange({ ...config, default_separator: config.default_separator.slice(0, -1) });
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        onChange({ ...config, default_separator: config.default_separator + input });
        return;
      }
    }

  });

  const marker = (f: FieldKey): string => (activeField === f ? "▸" : " ");

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "Settings"),
    React.createElement(
      Text,
      null,
      `${marker("theme")} theme:              ⟨ ${config.theme} ⟩`,
    ),
    React.createElement(
      Text,
      null,
      `${marker("default_separator")} default_separator:  "${displaySep(config.default_separator)}"`,
    ),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(
        Text,
        { dimColor: true },
        " ↑↓ field · ←→ cycle/adjust · type to customize separator · Backspace deletes · ␣ = space",
      ),
    ),
  );
}
