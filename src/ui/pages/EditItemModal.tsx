import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import type { Item, ItemType } from "../../config/schema.ts";
import { ItemTypeSchema } from "../../config/schema.ts";
import type { PulseSnapshot } from "../../core/types.ts";
import { ColorPicker, PALETTE } from "../components/ColorPicker.tsx";
import { ITEM_TYPE_DESCRIPTIONS } from "../data/itemTypeDescriptions.ts";
import { TOOL_CATALOG } from "../data/toolCatalog.ts";
import { defForType, BAR_STYLE_PRESETS } from "../data/itemTypeConfig.ts";
import { TypePickerModal } from "./TypePickerModal.tsx";
import { IconPickerModal } from "./IconPickerModal.tsx";
import { graphemes } from "../../lib/graphemes.ts";

export interface EditItemModalProps {
  item: Item;
  snapshot: PulseSnapshot;
  /** Current theme name — determines whether the ColorPicker edits
   * `style.fg` (classic themes) or `style.bg` (powerline). */
  theme?: string;
  onChange: (next: Item) => void;
  onClose: () => void;
  onCancel: () => void;
}

type FieldKey =
  | "type"
  | "name"
  | "icon"
  | "label"
  | "show_label"
  | "trailing_separator"
  | "parts_separator"
  | "format"
  | "display_mode"
  | "bar_style"
  | "margin_left"
  | "margin_right"
  | "color"
  | `flag:${string}`
  | `enum:${string}`
  | `num:${string}`
  | `text:${string}`;

export type TabKey = "basics" | "appearance" | "advanced" | "color";

export const TAB_ORDER: readonly TabKey[] = ["basics", "appearance", "advanced", "color"];

const BASICS_SET = new Set<string>(["type", "name", "icon", "label", "show_label"]);
const APPEARANCE_SET = new Set<string>([
  "trailing_separator",
  "parts_separator",
  "format",
  "display_mode",
  "bar_style",
  "margin_left",
  "margin_right",
]);

export function partitionFields(fields: readonly string[]): Record<TabKey, readonly string[]> {
  const basics: string[] = [];
  const appearance: string[] = [];
  const advanced: string[] = [];
  const color: string[] = [];
  for (const f of fields) {
    if (BASICS_SET.has(f)) basics.push(f);
    else if (APPEARANCE_SET.has(f)) appearance.push(f);
    else if (f === "color") color.push(f);
    else if (
      f.startsWith("text:") ||
      f.startsWith("flag:") ||
      f.startsWith("num:") ||
      f.startsWith("enum:")
    ) {
      advanced.push(f);
    }
  }
  return { basics, appearance, advanced, color };
}

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

function formatTextField(value: string, active: boolean, cursorPos?: number): string {
  if (!active) return JSON.stringify(value);
  const INV_ON = "\x1b[7m";
  const INV_OFF = "\x1b[27m";
  if (cursorPos === undefined) {
    return `"${value}${INV_ON} ${INV_OFF}"`;
  }
  const g = graphemes(value);
  if (cursorPos >= g.length) {
    return `"${value}${INV_ON} ${INV_OFF}"`;
  }
  const before = g.slice(0, cursorPos).join("");
  const curChar = g[cursorPos];
  const after = g.slice(cursorPos + 1).join("");
  return `"${before}${INV_ON}${curChar}${INV_OFF}${after}"`;
}

function initialFocusFieldIndex(fields: readonly FieldKey[]): number {
  const nameIndex = fields.indexOf("name");
  if (nameIndex >= 0) return nameIndex;
  const labelIndex = fields.indexOf("label");
  if (labelIndex >= 0) return labelIndex;
  return 0;
}

// Fields that accept arbitrary character input — the `?` shortcut must yield
// to these so users can type a literal '?' when the field is focused.
function isTextEntryField(f: FieldKey): boolean {
  if (f === "label" || f === "name") return true;
  if (f === "trailing_separator" || f === "parts_separator") return true;
  if (f === "margin_left" || f === "margin_right") return true;
  if (typeof f === "string" && f.startsWith("text:")) return true;
  return false;
}

export function EditItemModal({ item, snapshot, theme: _theme, onChange, onClose, onCancel }: EditItemModalProps): React.ReactElement {
  const def = defForType(item.type);
  // Items store a single semantic `color` field — the render engine
  // decides whether it lands as foreground (classic themes) or as a
  // background slot override (powerline) at paint time. The picker
  // label stays `color` everywhere so users don't have to track the
  // theme-dependent meaning.
  const pickerLabel = "color";
  const needsNameField = nameOptionKey(item.type) !== null;
  const supportsFormat = def.formats.length > 0;
  const baseFlags = def.extraFlags ?? [];
  // Items declaring supportsDynamicColor get a synthesised dynamic_color flag so
  // users can opt in to the default green→yellow→red ramp without editing
  // bar_thresholds by hand.
  const allExtraFlags = def.supportsDynamicColor
    ? [{ label: "dynamic_color", key: "dynamic_color" } as const, ...baseFlags]
    : baseFlags;
  const extraEnums = def.extraEnums ?? [];
  const allExtraNums = def.extraNums ?? [];
  const extraTexts = def.extraTexts ?? [];
  // Flags/Nums gated by a requiresFlag only surface when that flag is truthy.
  const opts = (item.options as Record<string, unknown> | undefined) ?? {};
  const extraFlags = allExtraFlags.filter(
    (f) => !("requiresFlag" in f) || !f.requiresFlag || Boolean(opts[f.requiresFlag]),
  );
  const extraNums = allExtraNums.filter(
    (n) => !n.requiresFlag || Boolean(opts[n.requiresFlag]),
  );
  // Sibling array-backed nums (e.g. color_ramp_stops[0..4]) collide on
  // FieldKey `num:<key>`. Disambiguate via arrayIndex when present.
  const numFieldKey = (
    n: { key: string; arrayIndex?: number },
  ): FieldKey =>
    (n.arrayIndex === undefined
      ? `num:${n.key}`
      : `num:${n.key}#${n.arrayIndex}`) as FieldKey;
  // Read the current scalar value of an ExtraNum, transparently unwrapping
  // an array slot when arrayIndex is set.
  const readNumValue = (
    n: {
      key: string;
      defaultValue: number;
      arrayIndex?: number;
      arrayDefaults?: readonly number[];
    },
  ): number => {
    const raw = (item.options as Record<string, unknown> | undefined)?.[n.key];
    if (n.arrayIndex === undefined) {
      return (raw as number | undefined) ?? n.defaultValue;
    }
    const arr = Array.isArray(raw) ? (raw as number[]) : undefined;
    return arr?.[n.arrayIndex] ?? n.arrayDefaults?.[n.arrayIndex] ?? n.defaultValue;
  };
  const flagFields: readonly FieldKey[] = extraFlags.map(
    (f) => `flag:${f.key}` as FieldKey,
  );
  const enumFields: readonly FieldKey[] = extraEnums.map(
    (e) => `enum:${e.key}` as FieldKey,
  );
  const numFields: readonly FieldKey[] = extraNums.map((n) => numFieldKey(n));
  const textFields: readonly FieldKey[] = extraTexts.map(
    (t) => `text:${t.key}` as FieldKey,
  );
  const FIELDS: readonly FieldKey[] = [
    "type",
    ...(needsNameField ? (["name"] as const) : []),
    "icon",
    "label",
    "show_label",
    "trailing_separator",
    "parts_separator",
    ...(supportsFormat ? (["format"] as const) : []),
    ...(def.supportsDisplayMode ? (["display_mode"] as const) : []),
    ...(def.supportsBarStyle ? (["bar_style"] as const) : []),
    ...textFields,
    ...flagFields,
    ...numFields,
    ...enumFields,
    "margin_left",
    "margin_right",
    "color",
  ];

  const [focus, setFocus] = useState<number>(() => initialFocusFieldIndex(FIELDS));
  const safeFocus = Math.min(focus, FIELDS.length - 1);
  const activeField = FIELDS[safeFocus] ?? "type";
  const tabBuckets = partitionFields(FIELDS as readonly string[]);
  const availableTabs = TAB_ORDER.filter((t) => tabBuckets[t].length > 0);
  const [activeTab, setActiveTab] = useState<TabKey>("basics");
  const safeActiveTab: TabKey = availableTabs.includes(activeTab) ? activeTab : (availableTabs[0] ?? "basics");
  const tabFieldSet = new Set<string>(tabBuckets[safeActiveTab]);
  const focusInTab = tabFieldSet.has(activeField as string);
  const effectiveFocusField: FieldKey = focusInTab
    ? activeField
    : ((tabBuckets[safeActiveTab][0] ?? activeField) as FieldKey);
  // When the type picker overlay is open, the parent input handler must stay
  // inert so keys (search text, ↑↓, Enter) only reach the picker.
  const [typePickerOpen, setTypePickerOpen] = useState<boolean>(false);
  const [iconPickerOpen, setIconPickerOpen] = useState<boolean>(false);
  // Snapshot of item.icon at the moment the picker opens. Preview mutations
  // during picking rewrite item.icon live; if the user Escs we restore this.
  const iconBeforePickRef = useRef<string | undefined>(undefined);
  // Label cursor: grapheme index, 0..g.length
  const [labelCursor, setLabelCursor] = useState<number>(0);
  const [descExpanded, setDescExpanded] = useState<boolean>(false);
  // When focus transitions INTO label, reset cursor to end
  useEffect(() => {
    if (effectiveFocusField === "label") {
      setLabelCursor(graphemes(item.label ?? "").length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFocusField]);

  useInput((input, key) => {
    if (typePickerOpen) return;
    if (iconPickerOpen) return;
    if (key.escape) { onCancel(); return; }
    if (key.tab) {
      if (availableTabs.length <= 1) return;
      const idx = availableTabs.indexOf(safeActiveTab);
      const safeIdx = idx < 0 ? 0 : idx;
      const nextIdx = key.shift
        ? (safeIdx - 1 + availableTabs.length) % availableTabs.length
        : (safeIdx + 1) % availableTabs.length;
      const nextTab = availableTabs[nextIdx]!;
      setActiveTab(nextTab);
      const firstField = tabBuckets[nextTab][0];
      if (firstField) setFocus(FIELDS.indexOf(firstField as FieldKey));
      return;
    }
    if (input === "?" && !key.ctrl && !key.meta && !isTextEntryField(effectiveFocusField)) {
      // `?` toggles the type-description detail panel, but must yield to
      // text-entry fields so users can literally type `?` in labels, names,
      // separators, margins, and extra text options.
      setDescExpanded((v) => !v);
      return;
    }
    // On the type field, Enter opens the picker instead of saving — users
    // need a way to launch the overlay without a binding collision.
    if (key.return) {
      if (effectiveFocusField === "type") { setTypePickerOpen(true); return; }
      onClose();
      return;
    }
    if (key.upArrow) { setFocus((f) => (f - 1 + FIELDS.length) % FIELDS.length); return; }
    if (key.downArrow) { setFocus((f) => (f + 1) % FIELDS.length); return; }

    if (effectiveFocusField === "icon") {
      if (input === " ") {
        iconBeforePickRef.current = item.icon;
        setIconPickerOpen(true);
        return;
      }
      if (key.backspace || key.delete) { onChange({ ...item, icon: undefined }); return; }
      return; // swallow other keys
    }

    if (effectiveFocusField === "label") {
      const labelVal = item.label ?? "";
      const g = graphemes(labelVal);
      const pos = labelCursor;
      if (key.leftArrow) { setLabelCursor(Math.max(0, pos - 1)); return; }
      if (key.rightArrow) { setLabelCursor(Math.min(g.length, pos + 1)); return; }
      if (key.backspace || key.delete) {
        if (pos < g.length) {
          const next = [...g.slice(0, pos), ...g.slice(pos + 1)].join("");
          onChange(setTextField(item, "label", next));
          if (pos > 0 && pos >= g.length - 1) setLabelCursor(pos - 1);
        } else if (pos > 0) {
          const next = g.slice(0, -1).join("");
          onChange(setTextField(item, "label", next));
          setLabelCursor(pos - 1);
        }
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        const inserted = graphemes(input);
        const next = [...g.slice(0, pos), ...inserted, ...g.slice(pos)].join("");
        onChange(setTextField(item, "label", next));
        setLabelCursor(pos + inserted.length);
        return;
      }
      return;
    }

    if (effectiveFocusField === "trailing_separator") {
      const current = textFieldValue(item, "trailing_separator");
      if (key.backspace || key.delete) {
        if (item.trailing_separator === undefined) {
          onChange(setTextField(item, "trailing_separator", ""));
          return;
        }
        onChange(setTextField(item, "trailing_separator", current.slice(0, -1)));
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        if (item.trailing_separator === undefined) {
          onChange(setTextField(item, "trailing_separator", input));
          return;
        }
        onChange(setTextField(item, "trailing_separator", current + input));
        return;
      }
    }

    if (effectiveFocusField === "type") {
      // Space also opens the picker — matches the "[Space] pick" hint and
      // gives users a single obvious key without competing with label text
      // entry on other fields.
      if (input === " ") { setTypePickerOpen(true); return; }
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

    if (effectiveFocusField === "name") {
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

    if (effectiveFocusField === "color") {
      if (key.leftArrow || key.rightArrow) {
        const cur = item.style?.color;
        const idx = cur ? PALETTE.indexOf(cur) : -1;
        const nextIdx = key.rightArrow
          ? (idx + 1) % PALETTE.length
          : (idx - 1 + PALETTE.length) % PALETTE.length;
        onChange({ ...item, style: { ...(item.style ?? {}), color: PALETTE[nextIdx]! } });
        return;
      }
    }

    if (effectiveFocusField === "show_label" && input === " ") {
      onChange({ ...item, show_label: item.show_label === false ? true : false });
      return;
    }

    if (effectiveFocusField === "bar_style" && (key.leftArrow || key.rightArrow)) {
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

    if (effectiveFocusField === "display_mode" && (key.leftArrow || key.rightArrow || input === " ")) {
      const cur = item.options?.display_mode ?? "used";
      const next = cur === "used" ? "remaining" : "used";
      const nextOptions = { ...(item.options ?? {}), display_mode: next } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (typeof effectiveFocusField === "string" && effectiveFocusField.startsWith("flag:") && input === " ") {
      const flagKey = effectiveFocusField.slice(5);
      const raw = (item.options as Record<string, unknown> | undefined)?.[flagKey];
      const flagDef = allExtraFlags.find((f) => f.key === flagKey);
      const dflt = flagDef && "defaultValue" in flagDef ? Boolean(flagDef.defaultValue) : false;
      const cur = raw === undefined ? dflt : Boolean(raw);
      const nextOptions = {
        ...(item.options ?? {}),
        [flagKey]: !cur,
      } as Item["options"];
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (
      typeof effectiveFocusField === "string" &&
      effectiveFocusField.startsWith("num:") &&
      (key.leftArrow || key.rightArrow)
    ) {
      // FieldKey is `num:<key>` for scalars and `num:<key>#<idx>` for
      // array-backed sibling nums (e.g. color_ramp_stops[i]).
      const rest = effectiveFocusField.slice(4);
      const hashAt = rest.indexOf("#");
      const numKey = hashAt < 0 ? rest : rest.slice(0, hashAt);
      const fieldArrayIdx = hashAt < 0 ? undefined : Number(rest.slice(hashAt + 1));
      const def2 = extraNums.find(
        (n) => n.key === numKey && n.arrayIndex === fieldArrayIdx,
      );
      if (!def2) return;
      const cur = readNumValue(def2);
      const step = def2.step ?? 1;
      const bigStep = def2.bigStep ?? step * 10;
      const magnitude = key.shift ? bigStep : step;
      const delta = (key.rightArrow ? 1 : -1) * magnitude;
      let next = Math.max(def2.min, Math.min(def2.max, cur + delta));
      const optsRec = (item.options as Record<string, unknown> | undefined) ?? {};
      let nextOptions: Item["options"];
      if (def2.arrayIndex === undefined) {
        nextOptions = { ...optsRec, [numKey]: next } as Item["options"];
      } else {
        // Materialise the full default array on first edit so the schema's
        // length-5-ascending invariant always holds when persisted.
        const existing = Array.isArray(optsRec[numKey])
          ? (optsRec[numKey] as number[]).slice()
          : (def2.arrayDefaults ?? []).slice();
        if (def2.enforceAscending) {
          const lo = def2.arrayIndex > 0 ? (existing[def2.arrayIndex - 1] ?? def2.min) : def2.min;
          const hi = def2.arrayIndex < existing.length - 1
            ? (existing[def2.arrayIndex + 1] ?? def2.max)
            : def2.max;
          next = Math.max(lo, Math.min(hi, next));
        }
        existing[def2.arrayIndex] = next;
        nextOptions = { ...optsRec, [numKey]: existing } as Item["options"];
      }
      onChange({ ...item, options: nextOptions });
      return;
    }

    if (typeof effectiveFocusField === "string" && effectiveFocusField.startsWith("text:")) {
      const textKey = effectiveFocusField.slice(5);
      const optsRec = (item.options as Record<string, unknown> | undefined) ?? {};
      const current = (optsRec[textKey] as string | undefined) ?? "";
      if (key.backspace || key.delete) {
        const next = current.slice(0, -1);
        const nextOpts: Record<string, unknown> = { ...optsRec };
        if (next === "") delete nextOpts[textKey];
        else nextOpts[textKey] = next;
        onChange({
          ...item,
          options: Object.keys(nextOpts).length > 0 ? (nextOpts as Item["options"]) : undefined,
        });
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        const nextOpts = { ...optsRec, [textKey]: current + input };
        onChange({ ...item, options: nextOpts as Item["options"] });
        return;
      }
    }

    if (
      typeof effectiveFocusField === "string" &&
      effectiveFocusField.startsWith("enum:") &&
      (key.leftArrow || key.rightArrow)
    ) {
      const enumKey = effectiveFocusField.slice(5);
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

    if (effectiveFocusField === "format" && supportsFormat && (key.leftArrow || key.rightArrow)) {
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

    if (effectiveFocusField === "margin_left" || effectiveFocusField === "margin_right") {
      const key2 = effectiveFocusField;
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

    if (effectiveFocusField === "parts_separator") {
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

  const marker = (f: FieldKey): string => (effectiveFocusField === f ? "▸" : " ");
  const doc = ITEM_TYPE_DESCRIPTIONS[item.type];
  const descSummary = doc?.summary ?? "";
  const descDetails = doc?.details ?? [];
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

  const tabHeader = availableTabs
    .map((t) => (t === safeActiveTab ? `[${t}]` : ` ${t} `))
    .join(" ");
  const children: React.ReactNode[] = [
    React.createElement(Text, { key: "title", bold: true }, `Edit Item   ${tabHeader}`),
    React.createElement(
      Text,
      { key: "type" },
      `${marker("type")} type:         ⟨ ${item.type} ⟩${effectiveFocusField === "type" ? "   [Enter/Space] pick" : ""}`,
    ),
    // Type description sits immediately under the type field so it's clearly
    // tied to the current selection. Summary first, then any detail lines
    // indented under a ↳ prefix.
    ...(descSummary
      ? [
          React.createElement(
            Text,
            { key: "desc-summary", dimColor: true },
            `   ↳ ${descSummary}${descDetails.length > 0 ? (descExpanded ? "  [?] less" : "  [?] more") : ""}`,
          ),
          ...(descExpanded
            ? descDetails.map((line, i) =>
                React.createElement(
                  Text,
                  { key: `desc-detail-${i}`, dimColor: true },
                  `     ${line}`,
                ),
              )
            : []),
        ]
      : []),
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
      { key: "icon" },
      `${marker("icon")} icon:         ${item.icon !== undefined ? item.icon + " " : "(none)"}${effectiveFocusField === "icon" ? "\x1b[7m \x1b[27m   [Space] pick · Backspace clear" : ""}`,
    ),
    React.createElement(
      Text,
      { key: "label" },
      `${marker("label")} label:        ${formatTextField(labelValue, effectiveFocusField === "label", effectiveFocusField === "label" ? labelCursor : undefined)}`,
    ),
    React.createElement(
      Text,
      { key: "showlabel" },
      `${marker("show_label")} show_label:   ${item.show_label === false ? "[ ]" : "[x]"}${emptyLabelHint}`,
    ),
    React.createElement(
      Text,
      { key: "tsep" },
      `${marker("trailing_separator")} trailing_separator: ${formatTextField(trailingSeparatorValue, effectiveFocusField === "trailing_separator")}`,
    ),
    React.createElement(
      Text,
      { key: "psep" },
      `${marker("parts_separator")} parts_separator:    ${formatTextField((item.options?.parts_separator as string | undefined) ?? "", effectiveFocusField === "parts_separator")}`,
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
    ...extraTexts.map((t) => {
      const raw = ((item.options as Record<string, unknown> | undefined)?.[t.key] as string | undefined) ?? "";
      const fk = `text:${t.key}` as FieldKey;
      const isActive = effectiveFocusField === fk;
      const display = raw === "" && t.placeholder && !isActive
        ? `(empty — ${t.placeholder})`
        : formatTextField(raw, isActive);
      return React.createElement(
        Text,
        { key: `text:${t.key}` },
        `${marker(fk)} ${t.label}:${" ".repeat(Math.max(1, 14 - t.label.length - 1))}${display}`,
      );
    }),
    ...extraFlags.map((f) => {
      const raw = (item.options as Record<string, unknown> | undefined)?.[f.key];
      // Flags may declare a defaultValue so "unset" displays as checked —
      // lets target toggles (color_bar etc.) start as "on" when the user
      // first opens the editor, matching runtime semantics.
      const dflt = "defaultValue" in f ? Boolean(f.defaultValue) : false;
      const val = raw === undefined ? dflt : Boolean(raw);
      return React.createElement(
        Text,
        { key: `flag:${f.key}` },
        `${marker(`flag:${f.key}` as FieldKey)} ${f.label}:${" ".repeat(Math.max(1, 14 - f.label.length - 1))}${val ? "[x]" : "[ ]"}`,
      );
    }),
    ...extraNums.map((n) => {
      const val = readNumValue(n);
      const hint = n.min === 0 && val === 0 ? (n.zeroHint ?? " (all)") : "";
      const fk = numFieldKey(n);
      return React.createElement(
        Text,
        { key: fk },
        `${marker(fk)} ${n.label}:${" ".repeat(Math.max(1, 14 - n.label.length - 1))}⟨ ${val} ⟩${hint}`,
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
      `${marker("margin_left")} margin_left:  ${formatTextField(item.margin_left ?? "", effectiveFocusField === "margin_left")}`,
    ),
    React.createElement(
      Text,
      { key: "margin_right" },
      `${marker("margin_right")} margin_right: ${formatTextField(item.margin_right ?? "", effectiveFocusField === "margin_right")}`,
    ),
    React.createElement(
      Box,
      { key: "color" },
      React.createElement(Text, null, `${marker("color")} `),
      React.createElement(ColorPicker, {
        label: pickerLabel,
        value: item.style?.color,
        onChange: (c) =>
          onChange({ ...item, style: { ...(item.style ?? {}), color: c } }),
      }),
    ),
    React.createElement(
      Text,
      { key: "help", dimColor: true },
      " ↑↓ field · [Tab/⇧Tab] section · ←→ change (⇧ big) · space toggle · ? detail · Enter save · Esc cancel",
    ),
  );

  const KEEP_ALWAYS = new Set<string>(["title", "help"]);
  const fieldKeyFromReactKey = (k: string | null): string | null => {
    if (!k) return null;
    if (k === "showlabel") return "show_label";
    if (k === "tsep") return "trailing_separator";
    if (k === "psep") return "parts_separator";
    return k;
  };
  const filteredChildren = children.filter((node) => {
    if (!React.isValidElement(node)) return true;
    const key = (node as React.ReactElement).key;
    const keyStr = typeof key === "string" ? key : null;
    if (!keyStr) return true;
    if (KEEP_ALWAYS.has(keyStr)) return true;
    if (keyStr.startsWith("desc-")) return safeActiveTab === "basics";
    const f = fieldKeyFromReactKey(keyStr);
    if (f === null) return true;
    return tabFieldSet.has(f);
  });

  if (typePickerOpen) {
    // Render the picker overlay standalone — its own useInput owns the
    // keyboard while open. onSelect applies the new type and closes.
    return React.createElement(TypePickerModal, {
      current: item.type,
      onSelect: (next) => {
        if (next !== item.type) onChange({ ...item, type: next });
        setTypePickerOpen(false);
      },
      onCancel: () => setTypePickerOpen(false),
    });
  }

  if (iconPickerOpen) {
    return React.createElement(IconPickerModal, {
      current: item.icon,
      onPreview: (glyph) => {
        // Live-write the highlighted glyph so LivePreview updates as the
        // cursor moves. Final commit (Enter) keeps whatever's there; cancel
        // (Esc) restores iconBeforePickRef.
        onChange({ ...item, icon: glyph });
      },
      onSelect: (glyph) => {
        onChange({ ...item, icon: glyph });
        setIconPickerOpen(false);
      },
      onCancel: () => {
        onChange({ ...item, icon: iconBeforePickRef.current });
        setIconPickerOpen(false);
      },
    });
  }

  return React.createElement(
    Box,
    { flexDirection: "column", borderStyle: "round", paddingX: 1 },
    ...filteredChildren,
  );
}
