import React from "react";
import { Box, Text } from "ink";

// 25-color palette organized in 3 semantic rows.
// Row 1: vibrant — accent / primary colors (9 incl. teal)
// Row 2: pastel — softer, long-read-friendly tones (8)
// Row 3: neutrals — grays, dim, whites, blacks (8)
export const PALETTE_ROWS: readonly (readonly string[])[] = [
  ["#F07178", "#FFCB6B", "#C3E88D", "#A8A8D7", "#89DDFF", "#82AAFF", "#FF79C6", "#FF5555"],
  ["#FFB6B9", "#FFE4A1", "#D8F0B1", "#B9E7F0", "#B5C8FF", "#D9B8F0", "#F7C6DE", "#FFC1B0"],
  ["#FFFFFF", "#D8D8D8", "#B0B0B0", "#808080", "#505050", "#303030", "#1E1E2E", "#000000"],
] as const;

export const PALETTE: readonly string[] = PALETTE_ROWS.flat();

export interface ColorPickerProps {
  value: string | undefined;
  onChange: (c: string) => void;
}

export function ColorPicker({ value, onChange: _ }: ColorPickerProps): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, "fg: "),
      React.createElement(Text, { dimColor: true }, value ?? "(none)"),
    ),
    ...PALETTE_ROWS.map((row, ri) =>
      React.createElement(
        Box,
        { key: `row-${ri}` },
        React.createElement(Text, null, "    "),
        ...row.map((c) =>
          React.createElement(
            Text,
            { key: c, color: c },
            c === value ? "● " : "○ ",
          ),
        ),
      ),
    ),
  );
}
