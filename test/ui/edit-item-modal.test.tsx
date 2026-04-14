import { test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React, { useState } from "react";
import type { Item } from "../../src/config/schema.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { EditItemModal } from "../../src/ui/pages/EditItemModal.tsx";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";

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

test("EditItemModal separates editable fields from read-only metadata", async () => {
  const app = renderModal({
    id: "i12",
    type: "reset_in_5h",
    label: "",
    options: { format: "relative_eta" },
  });

  await settle();

  const frame = app.lastFrame() ?? "";
  expect(frame).toContain("Editable");
  expect(frame).toContain("Read-only");
  expect(frame.indexOf("label:")).toBeGreaterThan(frame.indexOf("Editable"));
  expect(frame.indexOf("id:")).toBeGreaterThan(frame.indexOf("Read-only"));
  expect(frame).toContain('trailing_separator: " "');
  expect(frame).toContain("format:");

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
  expect(frame).toContain('label:        "ETA"');

  app.stdin.write("\u001B[B");
  await settle();
  app.stdin.write(" ");
  await settle();

  frame = app.lastFrame() ?? "";
  expect(frame).toContain("show_label:   [ ]");

  app.stdin.write("\u001B[B");
  await settle();
  app.stdin.write(" :: ");
  await settle();

  frame = app.lastFrame() ?? "";
  expect(frame).toContain('trailing_separator: " :: "');

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

  app.stdin.write("\u001B[B");
  await settle();
  app.stdin.write("\u001B[B");
  await settle();
  app.stdin.write("\b");
  await settle();

  const frame = app.lastFrame() ?? "";
  expect(frame).toContain('trailing_separator: ""');

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

  app.stdin.write("\u001B[C");
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
