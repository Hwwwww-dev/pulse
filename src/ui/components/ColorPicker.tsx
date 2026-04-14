import React from "react";
import { Box, Text } from "ink";
import { PALETTE_ROWS, PALETTE } from "../../config/palette.ts";

export { PALETTE_ROWS, PALETTE };

export interface ColorPickerProps {
  value: string | undefined;
  onChange: (c: string) => void;
  /** Label shown in the header row ("fg" / "bg" depending on caller). */
  label?: string;
}

export function ColorPicker({ value, label, onChange: _ }: ColorPickerProps): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, `${label ?? "fg"}: `),
      React.createElement(Text, { dimColor: true }, value ?? "(none)"),
    ),
    ...PALETTE_ROWS.map((row, ri) =>
      React.createElement(
        Box,
        { key: `row-${ri}` },
        React.createElement(Text, null, "    "),
        ...row.map((c) => {
          // Selected cell: render the swatch in inverse (terminal fills
          // the cell background with the color, the glyph becomes a
          // contrasting dark hole) so the pick reads instantly even on
          // cells whose fg is visually close to its neighbours. Unselected
          // cells stay as thin outline circles.
          // Selected cell gets a filled bold dot in its own color;
          // unselected cells stay as thin outline circles. No inverse /
          // bg fill — the user wants the glyph itself to light up.
          const selected = c === value;
          return React.createElement(
            Text,
            { key: c, color: c, bold: selected },
            selected ? " ● " : " ○ ",
          );
        }),
      ),
    ),
  );
}
