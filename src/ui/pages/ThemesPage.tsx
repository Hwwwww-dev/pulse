import React from "react";
import { Box, Text, useInput } from "ink";
import { THEMES } from "../../config/themes.ts";
import type { PulseConfig } from "../../config/schema.ts";

export interface ThemesPageProps {
  config: PulseConfig;
  onChange: (next: PulseConfig) => void;
}

export function ThemesPage({ config, onChange }: ThemesPageProps): React.ReactElement {
  const names = Object.keys(THEMES);

  useInput((input) => {
    if (!input) return;
    const n = Number(input);
    if (!Number.isInteger(n) || n < 1 || n > names.length) return;
    const picked = names[n - 1];
    if (picked && picked !== config.theme) onChange({ ...config, theme: picked });
  });

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "Themes (press number to apply)"),
    ...names.map((n, i) =>
      React.createElement(
        Text,
        { key: n, ...(n === config.theme ? { color: "cyan" as const } : {}) },
        ` ${i + 1}. ${n === config.theme ? "◉" : "○"} ${n}`,
      ),
    ),
  );
}
