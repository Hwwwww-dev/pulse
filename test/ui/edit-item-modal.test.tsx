import { test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React, { useState } from "react";
import type { Item } from "../../src/config/schema.ts";
import { aggregate } from "../../src/core/aggregator.ts";
import { EditItemModal } from "../../src/ui/pages/EditItemModal.tsx";
import { emptyCounters } from "../../src/input/jsonl.ts";
import { parseStdinPayload } from "../../src/input/stdin.ts";
import { stripAnsi } from "../../src/render/ansi.ts";

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

  const frame = app.lastFrame() ?? "";
  // "Editable" / "Read-only" section headers have been removed.
  expect(frame).not.toContain("Editable");
  expect(frame).not.toContain("Read-only");
  // The item id is no longer displayed.
  expect(frame).not.toContain("id:           i12");
  // Type description now sits directly under the type field.
  expect(frame).toContain("type:");
  expect(frame.indexOf("↳")).toBeGreaterThan(frame.indexOf("type:"));
  expect(frame.indexOf("label:")).toBeGreaterThan(frame.indexOf("↳"));
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
  // Active text field renders an inverse-video cursor block before the
  // closing quote, so assert on the stripped frame with a prefix match.
  expect(stripAnsi(frame)).toContain('label:        "ETA');

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
  // Active field has a trailing inverse-video cursor; compare against the
  // stripped frame with a prefix match.
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

  app.stdin.write("\u001B[B");
  await settle();
  app.stdin.write("\u001B[B");
  await settle();
  app.stdin.write("\b");
  await settle();

  const frame = app.lastFrame() ?? "";
  // trailing_separator is the active field, so its rendered value contains
  // an inverse-video cursor sequence (a single space once stripped) between
  // the quotes — confirming the underlying value is now empty, not " ".
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
