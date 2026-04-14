import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ItemType } from "../../config/schema.ts";
import { ITEM_TYPE_CATEGORIES } from "../data/itemTypeCategories.ts";
import { ITEM_TYPE_DESCRIPTIONS } from "../data/itemTypeDescriptions.ts";

export interface TypePickerModalProps {
  current: ItemType;
  onSelect: (next: ItemType) => void;
  onCancel: () => void;
}

interface Row {
  kind: "header" | "item";
  category: string;
  type?: ItemType;
}

function buildRows(query: string): Row[] {
  const q = query.trim().toLowerCase();
  const rows: Row[] = [];
  for (const cat of ITEM_TYPE_CATEGORIES) {
    const matches = cat.types.filter((t) => {
      if (!q) return true;
      if (t.toLowerCase().includes(q)) return true;
      const doc = ITEM_TYPE_DESCRIPTIONS[t];
      if (!doc) return false;
      if (doc.summary.toLowerCase().includes(q)) return true;
      return (doc.details ?? []).some((d) => d.toLowerCase().includes(q));
    });
    if (matches.length === 0) continue;
    rows.push({ kind: "header", category: cat.name });
    for (const t of matches) rows.push({ kind: "item", category: cat.name, type: t });
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

export function TypePickerModal({ current, onSelect, onCancel }: TypePickerModalProps): React.ReactElement {
  const [query, setQuery] = useState<string>("");
  const rows = useMemo(() => buildRows(query), [query]);
  const selectables = useMemo(() => selectableIndices(rows), [rows]);

  const [cursor, setCursor] = useState<number>(() => {
    // Start on the current type when possible so opening the picker is a no-op
    // unless the user actually moves.
    const idx = rows.findIndex((r) => r.kind === "item" && r.type === current);
    if (idx >= 0) return idx;
    return selectables[0] ?? 0;
  });

  // Clamp cursor when the filtered row set shrinks / shifts.
  const safeCursor = (() => {
    if (selectables.length === 0) return 0;
    if (rows[cursor]?.kind === "item") return cursor;
    // Snap to the nearest selectable row going forward, else the last.
    const next = selectables.find((i) => i >= cursor);
    return next ?? selectables[selectables.length - 1]!;
  })();

  const selectedType: ItemType | undefined =
    rows[safeCursor]?.kind === "item" ? rows[safeCursor]!.type : undefined;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (selectedType) onSelect(selectedType);
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
      // Reset cursor to top of filtered results on each edit.
      setCursor(selectables[0] ?? 0);
      return;
    }
    // Plain printable characters extend the filter. Ignore control chords
    // so Ctrl+C etc. still propagate to Ink's default handling.
    if (!key.ctrl && !key.meta && input.length > 0 && input >= " ") {
      setQuery((q) => q + input);
      setCursor(selectables[0] ?? 0);
      return;
    }
  });

  const doc = selectedType ? ITEM_TYPE_DESCRIPTIONS[selectedType] : undefined;

  // Visible list window — show up to 16 rows around the cursor so the box
  // stays compact on smaller terminals.
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
    const summary = ITEM_TYPE_DESCRIPTIONS[row.type!]?.summary ?? "";
    // Pad type name so summaries line up cleanly.
    const name = row.type!.padEnd(22);
    return React.createElement(
      Text,
      { key: `i:${row.type}`, inverse: isSelected },
      `${marker} ${name}${summary}`,
    );
  });

  if (rows.length === 0) {
    listChildren.push(
      React.createElement(Text, { key: "empty", dimColor: true }, " (no matches)"),
    );
  }

  return React.createElement(
    Box,
    { flexDirection: "column", borderStyle: "round", paddingX: 1 },
    React.createElement(Text, { key: "title", bold: true }, "Select Item Type"),
    React.createElement(
      Text,
      { key: "search" },
      `search: ${query}${query ? "" : " (type to filter)"}`,
    ),
    React.createElement(Text, { key: "sep1", dimColor: true }, "─".repeat(60)),
    ...listChildren,
    React.createElement(Text, { key: "sep2", dimColor: true }, "─".repeat(60)),
    // Detail pane — summary + every detail line for the currently highlighted
    // type. Helps users understand what they're about to pick.
    ...(doc
      ? [
          React.createElement(
            Text,
            { key: "detail-type", bold: true },
            selectedType ?? "",
          ),
          React.createElement(Text, { key: "detail-summary" }, `  ${doc.summary}`),
          ...(doc.details ?? []).map((d, i) =>
            React.createElement(
              Text,
              { key: `detail-${i}`, dimColor: true },
              `  ${d}`,
            ),
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
