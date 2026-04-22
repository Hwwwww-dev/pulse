import { test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React, { useState } from "react";
import type { Item } from "../../src/config/schema.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { EditItemModal } from "../../src/ui/pages/EditItemModal.tsx";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { stripAnsi } from "../../src/render/ansi.ts";
import { partitionFields, type TabKey } from "../../src/ui/pages/EditItemModal.tsx";

test("partitionFields groups FIELDS by tab and preserves order", () => {
  const fields = [
    "type", "name", "icon", "label", "show_label",
    "trailing_separator", "parts_separator", "format",
    "display_mode", "bar_style",
    "text:foo", "flag:bar", "num:baz", "enum:qux",
    "margin_left", "margin_right", "color",
  ] as const;
  const buckets = partitionFields(fields as unknown as readonly string[]);
  expect(buckets.basics).toEqual(["type", "name", "icon", "label", "show_label"]);
  expect(buckets.appearance).toEqual([
    "trailing_separator", "parts_separator", "format",
    "display_mode", "bar_style",
    "margin_left", "margin_right",
  ]);
  expect(buckets.advanced).toEqual(["text:foo", "flag:bar", "num:baz", "enum:qux"]);
  expect(buckets.color).toEqual(["color"]);
});

test("partitionFields returns empty array for missing tabs", () => {
  const buckets = partitionFields(["type", "color"] as readonly string[]);
  expect(buckets.advanced).toEqual([]);
  expect(buckets.appearance).toEqual([]);
});

// Compile-time marker so TabKey is a real export.
const _tabKeys: TabKey[] = ["basics", "appearance", "advanced", "color"];
expect(_tabKeys.length).toBe(4);

const parsed = parseStdinPayload(await Bun.file("test/fixtures/stdin/full.json").text());
if (!parsed.ok) throw new Error("fixture broken");
const snapshot = aggregate(parsed.data, emptyCounters(), undefined);

function renderModal(initialItem: Item) {
  function Harness(): React.ReactElement {
    const [item, setItem] = useState<Item>(initialItem);
    return React.createElement(EditItemModal, {
      item,
      snapshot,
      onChange: setItem,
      onClose: () => {},
      onCancel: () => {},
    });
  }

  return render(React.createElement(Harness));
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

test("EditItemModal shows type description inline and hides Editable/Read-only/id", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });

  await settle();
  const basicsFrame = app.lastFrame() ?? "";
  expect(basicsFrame).not.toContain("Editable");
  expect(basicsFrame).not.toContain("Read-only");
  expect(basicsFrame).not.toContain("id:           i12");
  expect(basicsFrame).toContain("type:");
  expect(basicsFrame.indexOf("↳")).toBeGreaterThan(basicsFrame.indexOf("type:"));
  expect(basicsFrame.indexOf("label:")).toBeGreaterThan(basicsFrame.indexOf("↳"));

  // Move to the appearance tab to verify separators + format.
  app.stdin.write("\t");
  await settle();
  const apprFrame = stripAnsi(app.lastFrame() ?? "");
  expect(apprFrame).toContain('trailing_separator: " ');
  expect(apprFrame).toContain("format:");

  app.unmount();
});

test("EditItemModal accepts custom label input, show_label toggle, and trailing separator input", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });

  await settle();
  app.stdin.write("ETA!");
  await settle();
  app.stdin.write("\b");
  await settle();

  let frame = app.lastFrame() ?? "";
  expect(stripAnsi(frame)).toContain('label:        "ETA');

  app.stdin.write("[B"); // ↓ to show_label
  await settle();
  app.stdin.write(" ");
  await settle();

  frame = app.lastFrame() ?? "";
  expect(frame).toContain("show_label:   [ ]");

  // Tab to appearance, focus auto-snaps to trailing_separator (first field).
  app.stdin.write("\t");
  await settle();
  app.stdin.write(" :: ");
  await settle();

  frame = app.lastFrame() ?? "";
  expect(stripAnsi(frame)).toContain('trailing_separator: " :: ');

  app.unmount();
});

test("EditItemModal lets trailing_separator be cleared to an empty string", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });

  await settle();

  // Tab → appearance, auto-snaps to trailing_separator (first field).
  app.stdin.write("\t");
  await settle();
  app.stdin.write("\b");
  await settle();

  const frame = app.lastFrame() ?? "";
  const stripped = stripAnsi(frame);
  expect(stripped).toContain('trailing_separator: " "');
  expect(stripped).not.toContain('trailing_separator: "  "');

  app.unmount();
});

test("EditItemModal lets tool_call choose from full tool catalog and type a custom tool name", async () => {
  const app = renderModal({
    id: "i20",
    type: "tool_call",
    label: "Read:",
    options: { tool_name: "Read" },
  });

  await settle();

  app.stdin.write("[C");
  await settle();

  let frame = app.lastFrame() ?? "";
  expect(frame).toContain("name:         ⟨ ReadMcpResourceTool ⟩");
  expect(frame).toContain('label:        "ReadMcpResourceTool:"');
  expect(frame).not.toContain("no data in snapshot");

  for (let i = 0; i < "ReadMcpResourceTool".length; i += 1) {
    app.stdin.write("\b");
    await settle();
  }
  app.stdin.write("WebSearch");
  await settle();

  frame = app.lastFrame() ?? "";
  expect(frame).toContain("name:         ⟨ WebSearch ⟩");
  expect(frame).toContain('label:        "WebSearch:"');

  app.unmount();
});

test("only basics-tab fields render on mount", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame).toContain("type:");
  expect(frame).toContain("label:");
  expect(frame).toContain("show_label:");
  expect(frame).not.toContain("trailing_separator:");
  expect(frame).not.toContain("format:");
  expect(frame).not.toContain("margin_left:");
  expect(frame).not.toMatch(/color:\s+\(none\)/);
  app.unmount();
});

test("tab header shows all four tabs with current one marked", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame).toMatch(/\[basics\].*appearance.*color/);
  app.unmount();
});

test("Tab key advances to next tab and resets focus to its first field", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });
  await settle();
  app.stdin.write("\t");
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame).toMatch(/\[appearance\]/);
  expect(frame).toContain("trailing_separator:");
  expect(frame).toContain("format:");
  expect(frame).not.toContain("show_label:");
  expect(frame).toMatch(/▸ trailing_separator:/);
  app.unmount();
});

test("Shift+Tab wraps backward from basics to the last available tab", async () => {
  const app = renderModal({
    id: "i1",
    type: "text",
    label: "hi",
  });
  await settle();
  app.stdin.write("[Z"); // Shift+Tab (CSI Z)
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame).toMatch(/\[color\]/);
  app.unmount();
});

test("type description details are hidden by default and toggle with ?", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });
  await settle();
  const collapsed = stripAnsi(app.lastFrame() ?? "");
  expect(collapsed).toContain("↳");
  // The reset_in_5h type description has one detail line that mentions
  // "relative_eta_*". When collapsed only the summary + `[?] more` hint is
  // visible; the detail body must be absent.
  expect(collapsed).toContain("[?] more");
  expect(collapsed).not.toContain("relative_eta_*");
  // Initial focus is `label` (a text-entry field that must capture `?` as
  // literal input). Move focus to `show_label` before toggling.
  app.stdin.write("\x1b[B"); // ↓ → show_label
  await settle();
  app.stdin.write("?");
  await settle();
  const expanded = stripAnsi(app.lastFrame() ?? "");
  expect(expanded).toContain("[?] less");
  expect(expanded).toContain("relative_eta_*");
  app.stdin.write("?");
  await settle();
  const collapsedAgain = stripAnsi(app.lastFrame() ?? "");
  expect(collapsedAgain).toContain("[?] more");
  expect(collapsedAgain).not.toContain("relative_eta_*");
  app.unmount();
});

test("help footer mentions Tab to switch tabs", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame.toLowerCase()).toContain("tab");
  app.unmount();
});
