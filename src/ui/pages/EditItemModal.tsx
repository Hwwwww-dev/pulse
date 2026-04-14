import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Item, ItemType } from "../../config/schema.ts";
import { ItemTypeSchema } from "../../config/schema.ts";
import type { PulseSnapshot } from "../../core/types.ts";
import { ColorPicker, PALETTE } from "../components/ColorPicker.tsx";
import { ITEM_TYPE_DESCRIPTIONS } from "../data/itemTypeDescriptions.ts";
import { TOOL_CATALOG } from "../data/toolCatalog.ts";
import { defForType, BAR_STYLE_PRESETS } from "../data/itemTypeConfig.ts";

export interface EditItemModalProps {
  item: Item;
  snapshot: PulseSnapshot;
  onChange: (next: Item) => void;
  onClose: () => void;
  onCancel: () => void;
}

type FieldKey =
  | "type"
  | "name"
  | "label"
  | "show_label"
  | "trailing_separator"
  | "parts_separator"
  | "format"
  | "display_mode"
  | "bar_style"
  | "margin_left"
  | "margin_right"
  | "fg"
  | `flag:${string}`
  | `enum:${string}`
  | `num:${string}`;
const ITEM_TYPES: readonly ItemType[] = ItemTypeSchema.options;

// Types that require picking a specific name from the snapshot counters.
function nameOptionKey(type: ItemType): "tool_name" | null {
  if (type === "tool_call") return "tool_name";
  return null;
}

function availableNames(type: ItemType, snap: PulseSnapshot | undefined): readonly string[] {
  const counters = snap?.counters;
  if (type === "tool_call") {
    const observed = Object.keys(counters?.tool_calls_by_name ?? {}).filter((name) => !TOOL_CATALOG.includes(name));
    return [...TOOL_CATALOG, ...observed.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))];
  }
  return [];
}

function currentName(item: Item): string | undefined {
  const key = nameOptionKey(item.type);
  if (!key) return undefined;
  return item.options?.[key];
}

function toolLabel(name: string): string {
  return `${name}:`;
}

function setName(item: Item, name: string): Item {
  const key = nameOptionKey(item.type);
  if (!key) return item;
  const prevName = currentName(item);
  const prevAutoLabel = prevName ? toolLabel(prevName) : undefined;
  const nextAutoLabel = name ? toolLabel(name) : undefined;
  const nextOptions = { ...(item.options ?? {}) } as Record<string, unknown>;
  if (name === "") delete nextOptions[key];
  else nextOptions[key] = name;
  const nextItem: Item = {
    ...item,
    ...(Object.keys(nextOptions).length > 0 ? { options: nextOptions as Item["options"] } : { options: undefined }),
  };
  if (item.type === "tool_call" && (item.label === undefined || item.label === "" || item.label === prevAutoLabel)) {
    nextItem.label = nextAutoLabel;
  }
  return nextItem;
}

function textFieldValue(item: Item, field: "label" | "trailing_separator"): string {
  return field === "label" ? (item.label ?? "") : (item.trailing_separator ?? " ");
}

function setTextField(item: Item, field: "label" | "trailing_separator", value: string): Item {
  if (field === "label") return { ...item, label: value === "" ? undefined : value };
  return { ...item, trailing_separator: value };
}

function formatTextField(value: string): string {
  return JSON.stringify(value);
}

function initialFocusFieldIndex(fields: readonly FieldKey[]): number {
  const nameIndex = fields.indexOf("name");
  if (nameIndex >= 0) return nameIndex;
  const labelIndex = fields.indexOf("label");
  if (labelIndex >= 0) return labelIndex;
  return 0;
}

export function EditItemModal({ item, snapshot, onChange, onClose, onCancel }: EditItemModalProps): React.ReactElement {
  const def = defForType(item.type);
  const needsNameField = nameOptionKey(item.type) !== null;
  const supportsFormat = def.formats.length > 0;
  const baseFlags = def.extraFlags ?? [];
  // Items declaring supportsAutoColor get a synthesised auto_color flag so
  // users can opt in to the default green→yellow→red ramp without editing
  // bar_thresholds by hand.
  const extraFlags = def.supportsAutoColor
    ? [...baseFlags, { label: "auto_color", key: "auto_color" }]
    : baseFlags;
  const extraEnums = def.extraEnums ?? [];
  const allExtraNums = def.extraNums ?? [];
  // Nums gated by a requiresFlag only surface when that flag is truthy.
  const opts = (item.options as Record<string, unknown> | undefined) ?? {};
  const extraNums = allExtraNums.filter(
    (n) => !n.requiresFlag || Boolean(opts[n.requiresFlag]),
  );
  const flagFields: readonly FieldKey[] = extraFlags.map(
    (f) => `flag:${f.key}` as FieldKey,
  );
  const enumFields: readonly FieldKey[] = extraEnums.map(
    (e) => `enum:${e.key}` as FieldKey,
  );
  const numFields: readonly FieldKey[] = extraNums.map(
    (n) => `num:${n.key}` as FieldKey,
  );
  const FIELDS: readonly FieldKey[] = [
    "type",
    ...(needsNameField ? (["name"] as const) : []),
    "label",
    "show_label",
    "trailing_separator",
    "parts_separator",
    ...(supportsFormat ? (["format"] as const) : []),
    ...(def.supportsDisplayMode ? (["display_mode"] as const) : []),
    ...(def.supportsBarStyle ? (["bar_style"] as const) : []),
    ...flagFields,
    ...numFields,
    ...enumFields,
    "margin_left",
    "margin_right",
    "fg",
  ];

  const [focus, setFocus] = useState<number>(() => initialFocusFieldIndex(FIELDS));
  const safeFocus = Math.min(focus, FIELDS.length - 1);
  const activeField = FIELDS[safeFocus] ?? "type";

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) { onClose(); return; }
    if (key.upArrow) { setFocus((f) => (f - 1 + FIELDS.length) % FIELDS.length); return; }
    if (key.downArrow) { setFocus((f) => (f + 1) % FIELDS.length); return; }

    if (activeField === "label" || activeField === "trailing_separator") {
      const current = textFieldValue(item, activeField);
      if (key.backspace || key.delete) {
        if (activeField === "trailing_separator" && item.trailing_separator === undefined) {
          onChange(setTextField(item, activeField, ""));
          return;
        }
        onChange(setTextField(item, activeField, current.slice(0, -1)));
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        if (activeField === "trailing_separator" && item.trailing_separator === undefined) {
          onChange(setTextField(item, activeField, input));
          return;
        }
        onChange(setTextField(item, activeField, current + input));
        return;
      }
    }

    if (activeField === "type") {
      if (key.leftArrow || key.rightArrow) {
        const idx = ITEM_TYPES.indexOf(item.type);
        const safeIdx = idx < 0 ? 0 : idx;
        const nextIdx = key.rightArrow
          ? (safeIdx + 1) % ITEM_TYPES.length
          : (safeIdx - 1 + ITEM_TYPES.length) % ITEM_TYPES.length;
        onChange({ ...item, type: ITEM_TYPES[nextIdx]! });
        return;
      }
    }

    if (activeField === "name") {
      if (item.type === "tool_call") {
        const current = currentName(item) ?? "";
        if (key.backspace || key.delete) {
          onChange(setName(item, current.slice(0, -1)));
          return;
        }
        if (!key.ctrl && !key.meta && input.length > 0) {
          onChange(setName(item, current + input));
          return;
        }
      }
      if (key.leftArrow || key.rightArrow) {
        const names = availableNames(item.type, snapshot);
        if (names.length === 0) return;
        const cur = currentName(item);
        const idx = cur ? names.indexOf(cur) : -1;
        const nextIdx = idx < 0
          ? (key.rightArrow ? 0 : names.length - 1)
          : key.rightArrow
          ? (idx + 1) % names.length
          : (idx - 1 + names.length) % names.length;
        onChange(setName(item, names[nextIdx]!));
        return;
      }
    }

    if (activeField === "fg") {
      if (key.leftArrow || key.rightArrow) {
        const cur = item.style?.fg;
        const idx = cur ? PALETTE.indexOf(cur) : -1;
        const nextIdx = key.rightArrow
          ? (idx + 1) % PALETTE.length
          : (idx - 1 + PALETTE.length) % PALETTE.length;
        onChange({ ...item, style: { ...(item.style ?? {}), fg: PALETTE[nextIdx]! } });
        return;
      }
    }

    if (activeField === "show_label" && input === " ") {
      onChange({ ...item, show_label: item.show_label === false ? true : false });
      return;
    }

    if (activeField === "bar_style" && (key.leftArrow || key.rightArrow)) {
      const cur = (item.options?.bar_style as string | undefined) ?? "dingbat";
      const idx = BAR_STYLE_PRESETS.indexOf(cur as (typeof BAR_STYLE_PRESETS)[number]);
      const safeIdx = idx < 0 ? 0 : idx;
      const nextIdx = key.rightArrow
        ? (safeIdx + 1) % BAR_STYLE_PRESETS.length
        : (safeIdx - 1 + BAR_STYLE_PRESETS.length) % BAR_STYLE_PRESETS.length;
      const nextOptions = {
        ...(item.options ?? {}),
        bar_style: BAR_STYLE_PRESETS[nextIdx],
      } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (activeField === "display_mode" && (key.leftArrow || key.rightArrow || input === " ")) {
      const cur = item.options?.display_mode ?? "used";
      const next = cur === "used" ? "remaining" : "used";
      const nextOptions = { ...(item.options ?? {}), display_mode: next } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (typeof activeField === "string" && activeField.startsWith("flag:") && input === " ") {
      const flagKey = activeField.slice(5);
      const cur = (item.options as Record<string, unknown> | undefined)?.[flagKey];
      const nextOptions = {
        ...(item.options ?? {}),
        [flagKey]: !cur,
      } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (
      typeof activeField === "string" &&
      activeField.startsWith("num:") &&
      (key.leftArrow || key.rightArrow)
    ) {
      const numKey = activeField.slice(4);
      const def2 = extraNums.find((n) => n.key === numKey);
      if (!def2) return;
      const cur = ((item.options as Record<string, unknown> | undefined)?.[numKey] as number | undefined) ?? def2.defaultValue;
      const step = def2.step ?? 1;
      const bigStep = def2.bigStep ?? step * 10;
      const magnitude = key.shift ? bigStep : step;
      const delta = (key.rightArrow ? 1 : -1) * magnitude;
      const next = Math.max(def2.min, Math.min(def2.max, cur + delta));
      const nextOptions = {
        ...(item.options ?? {}),
        [numKey]: next,
      } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (
      typeof activeField === "string" &&
      activeField.startsWith("enum:") &&
      (key.leftArrow || key.rightArrow)
    ) {
      const enumKey = activeField.slice(5);
      const def2 = extraEnums.find((e) => e.key === enumKey);
      if (!def2) return;
      const cur = ((item.options as Record<string, unknown> | undefined)?.[enumKey] as string | undefined) ?? def2.defaultValue;
      const idx = def2.options.indexOf(cur);
      const safeIdx = idx < 0 ? 0 : idx;
      const nextIdx = key.rightArrow
        ? (safeIdx + 1) % def2.options.length
        : (safeIdx - 1 + def2.options.length) % def2.options.length;
      const nextOptions = {
        ...(item.options ?? {}),
        [enumKey]: def2.options[nextIdx],
      } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (activeField === "format" && supportsFormat && (key.leftArrow || key.rightArrow)) {
      const formats = def.formats;
      const cur = (item.options?.format as string | undefined) ?? "";
      const idx = formats.indexOf(cur);
      const safeIdx = idx < 0 ? 0 : idx;
      const nextIdx = key.rightArrow
        ? (safeIdx + 1) % formats.length
        : (safeIdx - 1 + formats.length) % formats.length;
      const nextFormat = formats[nextIdx]!;
      const nextOptions = { ...(item.options ?? {}), format: nextFormat } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (activeField === "margin_left" || activeField === "margin_right") {
      const key2 = activeField;
      const current = item[key2] ?? "";
      if (key.backspace || key.delete) {
        onChange({ ...item, [key2]: current.slice(0, -1) === "" ? undefined : current.slice(0, -1) });
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        onChange({ ...item, [key2]: current + input });
        return;
      }
    }

    if (activeField === "parts_separator") {
      const opts = (item.options ?? {}) as Record<string, unknown>;
      const current = (opts.parts_separator as string | undefined) ?? "";
      if (key.backspace || key.delete) {
        const next = current.slice(0, -1);
        const nextOpts = { ...opts };
        if (next === "" && opts.parts_separator === undefined) return;
        if (next === "") delete nextOpts.parts_separator;
        else nextOpts.parts_separator = next;
        onChange({
          ...item,
          options: Object.keys(nextOpts).length > 0 ? (nextOpts as Item["options"]) : undefined,
        });
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        const nextOpts = { ...opts, parts_separator: current + input };
        onChange({ ...item, options: nextOpts as Item["options"] });
        return;
      }
    }

  });

  const marker = (f: FieldKey): string => (activeField === f ? "▸" : " ");
  const description = ITEM_TYPE_DESCRIPTIONS[item.type] ?? "";
  const nameValue = currentName(item) ?? "(unset)";
  const nameOptions = availableNames(item.type, snapshot);
  const labelValue = textFieldValue(item, "label");
  const trailingSeparatorValue = textFieldValue(item, "trailing_separator");
  const emptyLabelHint = labelValue === "" ? " (label empty)" : "";
  const nameHint = item.type === "tool_call"
    ? ""
    : nameOptions.length === 0
    ? " (no data in snapshot)"
    : "";

  const children: React.ReactNode[] = [
    React.createElement(Text, { key: "title", bold: true }, `Edit Item`),
    React.createElement(Text, { key: "editable-title", bold: true }, " Editable"),
    React.createElement(
      Text,
      { key: "type" },
      `${marker("type")} type:         ⟨ ${item.type} ⟩`,
    ),
  ];

  if (needsNameField) {
    children.push(
      React.createElement(
        Text,
        { key: "name" },
        `${marker("name")} name:         ⟨ ${nameValue} ⟩${nameHint}`,
      ),
    );
  }

  children.push(
    React.createElement(
      Text,
      { key: "label" },
      `${marker("label")} label:        ${formatTextField(labelValue)}`,
    ),
    React.createElement(
      Text,
      { key: "showlabel" },
      `${marker("show_label")} show_label:   ${item.show_label === false ? "[ ]" : "[x]"}${emptyLabelHint}`,
    ),
    React.createElement(
      Text,
      { key: "tsep" },
      `${marker("trailing_separator")} trailing_separator: ${formatTextField(trailingSeparatorValue)}`,
    ),
    React.createElement(
      Text,
      { key: "psep" },
      `${marker("parts_separator")} parts_separator:    ${formatTextField((item.options?.parts_separator as string | undefined) ?? "")}`,
    ),
    ...(supportsFormat
      ? [React.createElement(
          Text,
          { key: "format" },
          `${marker("format")} format:       ⟨ ${(item.options?.format as string | undefined) ?? "(none)"} ⟩`,
        )]
      : []),
    ...(def.supportsDisplayMode
      ? [React.createElement(
          Text,
          { key: "display_mode" },
          `${marker("display_mode")} display_mode: ⟨ ${item.options?.display_mode ?? "used"} ⟩`,
        )]
      : []),
    ...(def.supportsBarStyle
      ? [React.createElement(
          Text,
          { key: "bar_style" },
          `${marker("bar_style")} bar_style:    ⟨ ${(item.options?.bar_style as string | undefined) ?? "dingbat"} ⟩`,
        )]
      : []),
    ...extraFlags.map((f) => {
      const val = (item.options as Record<string, unknown> | undefined)?.[f.key];
      return React.createElement(
        Text,
        { key: `flag:${f.key}` },
        `${marker(`flag:${f.key}` as FieldKey)} ${f.label}:${" ".repeat(Math.max(1, 14 - f.label.length - 1))}${val ? "[x]" : "[ ]"}`,
      );
    }),
    ...extraNums.map((n) => {
      const val = ((item.options as Record<string, unknown> | undefined)?.[n.key] as number | undefined) ?? n.defaultValue;
      const hint = n.min === 0 && val === 0 ? " (all)" : "";
      return React.createElement(
        Text,
        { key: `num:${n.key}` },
        `${marker(`num:${n.key}` as FieldKey)} ${n.label}:${" ".repeat(Math.max(1, 14 - n.label.length - 1))}⟨ ${val} ⟩${hint}`,
      );
    }),
    ...extraEnums.map((e) => {
      const val = ((item.options as Record<string, unknown> | undefined)?.[e.key] as string | undefined) ?? e.defaultValue;
      return React.createElement(
        Text,
        { key: `enum:${e.key}` },
        `${marker(`enum:${e.key}` as FieldKey)} ${e.label}:${" ".repeat(Math.max(1, 14 - e.label.length - 1))}⟨ ${val} ⟩`,
      );
    }),
    React.createElement(
      Text,
      { key: "margin_left" },
      `${marker("margin_left")} margin_left:  ${formatTextField(item.margin_left ?? "")}`,
    ),
    React.createElement(
      Text,
      { key: "margin_right" },
      `${marker("margin_right")} margin_right: ${formatTextField(item.margin_right ?? "")}`,
    ),
    React.createElement(
      Box,
      { key: "fg" },
      React.createElement(Text, null, `${marker("fg")} `),
      React.createElement(ColorPicker, {
        value: item.style?.fg,
        onChange: (c) => onChange({ ...item, style: { ...(item.style ?? {}), fg: c } }),
      }),
    ),
    React.createElement(Text, { key: "readonly-title", bold: true }, " Read-only"),
    React.createElement(
      Text,
      { key: "desc", dimColor: true },
      `   ↳ ${description}`,
    ),
    React.createElement(Text, { key: "id", dimColor: true }, ` id:           ${item.id}`),
    React.createElement(
      Text,
      { key: "help", dimColor: true },
      " ↑↓ field · type text / ←→ change · Shift+←→ big step · Backspace delete · space toggle · [Enter] save · [Esc] cancel",
    ),
  );

  return React.createElement(
    Box,
    { flexDirection: "column", borderStyle: "round", paddingX: 1 },
    ...children,
  );
}
