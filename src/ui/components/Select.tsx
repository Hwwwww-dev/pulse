import React from "react";
import { Box, Text } from "ink";

export interface SelectProps<T extends string> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
}

export function Select<T extends string>({ items, value, onChange: _ }: SelectProps<T>) {
  return React.createElement(
    Box,
    null,
    items.map((it) =>
      React.createElement(
        Text,
        { key: it, ...(it === value ? { color: "cyan" as const } : {}) },
        `${it === value ? "◉" : "○"} ${it}  `,
      ),
    ),
  );
}
