import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ICON_CATEGORIES } from "../data/iconCatalog.ts";
import type { Icon } from "../data/iconCatalog.ts";

export interface IconPickerModalProps {
  current: string | undefined;
  onSelect: (glyph: string) => void;
  onCancel: () => void;
  // Live preview: fires whenever the highlighted icon changes so the caller
  // can mirror it into the item's icon field and LivePreview re-renders.
  onPreview?: (glyph: string) => void;
}

interface Row {
  kind: "header" | "item";
  category: string;
  icon?: Icon;
}

function buildRows(query: string): Row[] {
  const q = query.trim().toLowerCase();
  const rows: Row[] = [];
  for (const cat of ICON_CATEGORIES) {
    const matches = cat.icons.filter((icon) => {
      if (!q) return true;
      if (icon.name.toLowerCase().includes(q)) return true;
      return (icon.keywords ?? []).some((kw) => kw.toLowerCase().includes(q));
    });
    if (matches.length === 0) continue;
    rows.push({ kind: "header", category: cat.name });
    for (const icon of matches) rows.push({ kind: "item", category: cat.name, icon });
  }
  return rows;
}

function selectableIndices(rows: readonly Row[]): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind === "item") out.push(i);
  });
  return out;
}

export function IconPickerModal({ current, onSelect, onCancel, onPreview }: IconPickerModalProps): React.ReactElement {
  const [query, setQuery] = useState<string>("");
  const rows = useMemo(() => buildRows(query), [query]);
  const selectables = useMemo(() => selectableIndices(rows), [rows]);

  const [cursor, setCursor] = useState<number>(() => {
    if (current) {
      const idx = rows.findIndex((r) => r.kind === "item" && r.icon?.glyph === current);
      if (idx >= 0) return idx;
    }
    return selectables[0] ?? 0;
  });

  // Clamp cursor when the filtered row set shrinks / shifts.
  const safeCursor = (() => {
    if (selectables.length === 0) return 0;
    if (rows[cursor]?.kind === "item") return cursor;
    const next = selectables.find((i) => i >= cursor);
    return next ?? selectables[selectables.length - 1]!;
  })();

  const selectedIcon: Icon | undefined =
    rows[safeCursor]?.kind === "item" ? rows[safeCursor]!.icon : undefined;

  // Fire onPreview whenever the highlighted glyph changes so the parent can
  // mirror it into the edited item and LivePreview reflects the pick live.
  useEffect(() => {
    if (onPreview && selectedIcon) onPreview(selectedIcon.glyph);
  }, [selectedIcon?.glyph]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (selectedIcon) onSelect(selectedIcon.glyph);
      return;
    }
    if (key.upArrow) {
      const pos = selectables.indexOf(safeCursor);
      if (pos > 0) setCursor(selectables[pos - 1]!);
      return;
    }
    if (key.downArrow) {
      const pos = selectables.indexOf(safeCursor);
      if (pos >= 0 && pos < selectables.length - 1) setCursor(selectables[pos + 1]!);
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setCursor(selectables[0] ?? 0);
      return;
    }
    if (!key.ctrl && !key.meta && input.length > 0 && input >= " ") {
      setQuery((q) => q + input);
      setCursor(selectables[0] ?? 0);
      return;
    }
  });

  // Visible list window — 16 rows
  const WINDOW = 16;
  const windowStart = (() => {
    if (rows.length <= WINDOW) return 0;
    const half = Math.floor(WINDOW / 2);
    const max = rows.length - WINDOW;
    return Math.max(0, Math.min(max, safeCursor - half));
  })();
  const windowed = rows.slice(windowStart, windowStart + WINDOW);

  const listChildren: React.ReactNode[] = windowed.map((row, i) => {
    const rowIdx = windowStart + i;
    if (row.kind === "header") {
      return React.createElement(
        Text,
        { key: `h:${row.category}`, bold: true, color: "cyan" },
        `── ${row.category} ──`,
      );
    }
    const isSelected = rowIdx === safeCursor;
    const marker = isSelected ? "▸" : " ";
    return React.createElement(
      Box,
      { key: `i:${row.icon!.name}` },
      React.createElement(Text, { inverse: isSelected }, `${marker} `),
      React.createElement(Text, { inverse: isSelected, bold: true }, `${row.icon!.glyph}  `),
      React.createElement(Text, { inverse: isSelected, dimColor: !isSelected }, row.icon!.name),
    );
  });

  if (rows.length === 0) {
    listChildren.push(
      React.createElement(Text, { key: "empty", dimColor: true }, " (no matches)"),
    );
  }

  // Detail pane
  const codepoint = selectedIcon
    ? (selectedIcon.glyph.codePointAt(0)?.toString(16).toUpperCase() ?? "?")
    : undefined;

  return React.createElement(
    Box,
    { flexDirection: "column", borderStyle: "round", paddingX: 1 },
    React.createElement(Text, { key: "title", bold: true }, "Select Icon"),
    React.createElement(
      Text,
      { key: "search" },
      `search: ${query}${query ? "" : " (type to filter)"}`,
    ),
    React.createElement(Text, { key: "sep1", dimColor: true }, "─".repeat(60)),
    ...listChildren,
    React.createElement(Text, { key: "sep2", dimColor: true }, "─".repeat(60)),
    ...(selectedIcon && codepoint
      ? [
          React.createElement(
            Text,
            { key: "detail-glyph", bold: true },
            `  ${selectedIcon.glyph}  ${selectedIcon.name}  U+${codepoint}`,
          ),
        ]
      : []),
    React.createElement(Text, { key: "sep3", dimColor: true }, "─".repeat(60)),
    React.createElement(
      Text,
      { key: "help", dimColor: true },
      " ↑↓ move · type to filter · Backspace clear · [Enter] select · [Esc] cancel",
    ),
  );
}
