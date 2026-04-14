import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PulseConfig, Item } from "../../config/schema.ts";
import type { PulseSnapshot } from "../../core/types.ts";
import { EditItemModal } from "./EditItemModal.tsx";

export interface LayoutPageProps {
  config: PulseConfig;
  snapshot: PulseSnapshot;
  onChange: (next: PulseConfig) => void;
  onEditingChange?: (editing: boolean) => void;
}

interface Cursor {
  lineIdx: number;
  itemIdx: number;
}

function replaceItem(config: PulseConfig, c: Cursor, next: Item): PulseConfig {
  const nextLines = config.lines.map((ln, li) =>
    li === c.lineIdx
      ? { ...ln, items: ln.items.map((it, ii) => (ii === c.itemIdx ? next : it)) }
      : ln,
  );
  return { ...config, lines: nextLines };
}

function moveItem(config: PulseConfig, c: Cursor, delta: -1 | 1): { config: PulseConfig; cursor: Cursor } | null {
  const line = config.lines[c.lineIdx];
  if (!line) return null;
  const target = c.itemIdx + delta;
  if (target < 0 || target >= line.items.length) return null;
  const nextItems = line.items.slice();
  const [moved] = nextItems.splice(c.itemIdx, 1);
  if (!moved) return null;
  nextItems.splice(target, 0, moved);
  const nextLines = config.lines.map((ln, li) => (li === c.lineIdx ? { ...ln, items: nextItems } : ln));
  return { config: { ...config, lines: nextLines }, cursor: { ...c, itemIdx: target } };
}

export function LayoutPage({ config, snapshot, onChange, onEditingChange }: LayoutPageProps): React.ReactElement {
  const [cursor, setCursor] = useState<Cursor>({ lineIdx: 0, itemIdx: 0 });
  const [editing, setEditing] = useState<boolean>(false);
  const [originalItem, setOriginalItem] = useState<Item | null>(null);

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);

  useInput((input, key) => {
    if (editing) return;
    const line = config.lines[cursor.lineIdx];
    if (!line) return;

    // Sorting: Shift+↑/↓ moves the focused item within its line.
    if (key.shift && key.upArrow) {
      const r = moveItem(config, cursor, -1);
      if (r) { onChange(r.config); setCursor(r.cursor); }
      return;
    }
    if (key.shift && key.downArrow) {
      const r = moveItem(config, cursor, 1);
      if (r) { onChange(r.config); setCursor(r.cursor); }
      return;
    }

    if (key.upArrow) {
      if (cursor.itemIdx > 0) setCursor({ ...cursor, itemIdx: cursor.itemIdx - 1 });
      else if (cursor.lineIdx > 0) {
        const prev = config.lines[cursor.lineIdx - 1];
        setCursor({ lineIdx: cursor.lineIdx - 1, itemIdx: Math.max(0, (prev?.items.length ?? 1) - 1) });
      }
    } else if (key.downArrow) {
      if (cursor.itemIdx < line.items.length - 1) setCursor({ ...cursor, itemIdx: cursor.itemIdx + 1 });
      else if (cursor.lineIdx < config.lines.length - 1) {
        setCursor({ lineIdx: cursor.lineIdx + 1, itemIdx: 0 });
      }
    } else if (key.return) {
      const item = line.items[cursor.itemIdx];
      if (item) {
        setOriginalItem(item);
        setEditing(true);
      }
    } else if (input === "d") {
      const nextLines = config.lines.map((ln, li) =>
        li === cursor.lineIdx ? { ...ln, items: ln.items.filter((_, i) => i !== cursor.itemIdx) } : ln,
      );
      onChange({ ...config, lines: nextLines });
    } else if (input === "a") {
      const newItem: Item = { id: `i-${Date.now()}`, type: "text", options: { literal: "new" } };
      const nextLines = config.lines.map((ln, li) =>
        li === cursor.lineIdx
          ? { ...ln, items: [...ln.items.slice(0, cursor.itemIdx + 1), newItem, ...ln.items.slice(cursor.itemIdx + 1)] }
          : ln,
      );
      onChange({ ...config, lines: nextLines });
      setCursor({ ...cursor, itemIdx: cursor.itemIdx + 1 });
    } else if (input === "n") {
      const newItem: Item = { id: `i-${Date.now()}`, type: "text", options: { literal: "new" } };
      const nextLines = [...config.lines, { items: [newItem] }];
      onChange({ ...config, lines: nextLines });
      setCursor({ lineIdx: nextLines.length - 1, itemIdx: 0 });
    }
  });

  if (editing) {
    const currentItem = config.lines[cursor.lineIdx]?.items[cursor.itemIdx];
    if (!currentItem) {
      setEditing(false);
      setOriginalItem(null);
    } else {
      return React.createElement(EditItemModal, {
        item: currentItem,
        snapshot,
        theme: config.theme,
        onChange: (next) => onChange(replaceItem(config, cursor, next)),
        onClose: () => {
          setEditing(false);
          setOriginalItem(null);
        },
        onCancel: () => {
          if (originalItem) onChange(replaceItem(config, cursor, originalItem));
          setEditing(false);
          setOriginalItem(null);
        },
      });
    }
  }

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "Layout"),
    ...config.lines.flatMap((line, li) => [
      React.createElement(Text, { key: `l-${li}`, dimColor: true }, ` Line ${li + 1}`),
      ...line.items.map((it, ii) =>
        React.createElement(
          Text,
          {
            key: `l-${li}-${ii}`,
            ...(li === cursor.lineIdx && ii === cursor.itemIdx ? { color: "cyan" as const } : {}),
          },
          `   ${li === cursor.lineIdx && ii === cursor.itemIdx ? "▸" : " "} ${it.type} [${it.label ?? ""}]`,
        ),
      ),
    ]),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(
        Text,
        { dimColor: true },
        " ↑↓ navigate · Shift+↑↓ reorder · Enter edit · a add · d delete · n new line",
      ),
    ),
  );
}
