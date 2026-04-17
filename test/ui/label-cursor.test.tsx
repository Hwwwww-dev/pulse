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
  let lastItem: Item = initialItem;
  function Harness(): React.ReactElement {
    const [item, setItem] = useState<Item>(initialItem);
    lastItem = item;
    return React.createElement(EditItemModal, {
      item,
      snapshot,
      onChange: (next) => { setItem(next); lastItem = next; },
      onClose: () => {},
      onCancel: () => {},
    });
  }
  const app = render(React.createElement(Harness));
  return { app, getItem: () => lastItem };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

// Helper: navigate to label field.
// initialFocusFieldIndex starts on "label" (index 2 in FIELDS) because
// there is no "name" field for the "text" type. No navigation needed.
async function focusLabel(_app: ReturnType<typeof render>): Promise<void> {
  // Already focused on label at mount. Just settle.
  await settle();
}

test("cursor lands at end of label when focus enters label field", async () => {
  const { app } = renderModal({
    id: "i1",
    type: "text",
    label: "abc",
  });
  await settle();
  await focusLabel(app);
  const frame = stripAnsi(app.lastFrame() ?? "");
  // Cursor should be after "abc" — stripped frame shows '"abc "' (cursor is the space)
  expect(frame).toContain('"abc ');
  app.unmount();
});

test("left arrow moves cursor left", async () => {
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: "abc",
  });
  await settle();
  await focusLabel(app);
  app.stdin.write("\u001b[D"); // left → pos 2 (cursor on 'c')
  await settle();
  // Verify by deleting: backspace at pos 2 removes 'c' (char under cursor)
  app.stdin.write("\b");
  await settle();
  expect(getItem().label).toBe("ab");
  app.unmount();
});

test("backspace at pos 1 removes 'b' from 'abc' → 'ac'", async () => {
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: "abc",
  });
  await settle();
  await focusLabel(app);
  // cursor at pos 3 (end). Move left twice to pos 1 (cursor on 'b')
  app.stdin.write("\u001b[D"); // left → pos 2
  await settle();
  app.stdin.write("\u001b[D"); // left → pos 1
  await settle();
  app.stdin.write("\b"); // backspace at pos 1 removes char under cursor ('b')
  await settle();
  expect(getItem().label).toBe("ac");
  app.unmount();
});

test("backspace removes correct char using cursor position", async () => {
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: "abc",
  });
  await settle();
  await focusLabel(app);
  // cursor at end (pos 3), backspace removes 'c'
  app.stdin.write("\b");
  await settle();
  expect(getItem().label).toBe("ab");
  // backspace again removes 'b'
  app.stdin.write("\b");
  await settle();
  expect(getItem().label).toBe("a");
  app.unmount();
});

test("inserting text at middle position works", async () => {
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: "ac",
  });
  await settle();
  await focusLabel(app);
  // cursor at end (pos 2). Move left once to pos 1 (between 'a' and 'c')
  app.stdin.write("\u001b[D");
  await settle();
  app.stdin.write("b");
  await settle();
  expect(getItem().label).toBe("abc");
  app.unmount();
});

test("grapheme safety: nerd font glyph moves as single unit", async () => {
  const glyph = "\u{f02a2}";
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: glyph,
  });
  await settle();
  await focusLabel(app);
  // Cursor at end (pos 1 grapheme-wise). Move left once → pos 0
  app.stdin.write("\u001b[D");
  await settle();
  // Move right once → pos 1 (back to end)
  app.stdin.write("\u001b[C");
  await settle();
  // Backspace at end removes the glyph
  app.stdin.write("\b");
  await settle();
  // Label should now be empty (undefined)
  expect(getItem().label).toBeUndefined();
  app.unmount();
});

test("label cursor: label becomes undefined when emptied", async () => {
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: "x",
  });
  await settle();
  await focusLabel(app);
  app.stdin.write("\b");
  await settle();
  expect(getItem().label).toBeUndefined();
  app.unmount();
});

test("trailing_separator still uses append-only logic", async () => {
  const { app, getItem } = renderModal({
    id: "i1",
    type: "text",
    label: "hi",
  });
  await settle();
  await focusLabel(app);
  // From label (index 2), move down to show_label (3) then trailing_separator (4)
  app.stdin.write("\u001b[B"); // → show_label
  await settle();
  app.stdin.write("\u001b[B"); // → trailing_separator
  await settle();
  app.stdin.write("X");
  await settle();
  // trailing_separator was undefined (not " " default), typing sets it to "X"
  // then typing again appends: "XY"
  app.stdin.write("Y");
  await settle();
  expect(getItem().trailing_separator).toBe("XY");
  app.unmount();
});
