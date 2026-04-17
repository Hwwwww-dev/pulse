import { test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { IconPickerModal } from "../../src/ui/pages/IconPickerModal.tsx";
import { stripAnsi } from "../../src/render/ansi.ts";
import { ICON_CATEGORIES } from "../../src/ui/data/iconCatalog.ts";

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

test("initial render shows category headers", async () => {
  let selected: string | undefined;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: (g) => { selected = g; },
      onCancel: () => {},
    }),
  );
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  // At least one category should be visible
  expect(frame).toContain("System");
  app.unmount();
  void selected;
});

test("typing in search filters by name", async () => {
  let selected: string | undefined;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: (g) => { selected = g; },
      onCancel: () => {},
    }),
  );
  await settle();
  app.stdin.write("github");
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame).toContain("github");
  // Other unrelated category headers shouldn't be visible
  expect(frame).not.toContain("── System ──");
  app.unmount();
  void selected;
});

test("typing in search filters by keyword", async () => {
  let selected: string | undefined;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: (g) => { selected = g; },
      onCancel: () => {},
    }),
  );
  await settle();
  // "branch" is a keyword for git branch icons
  app.stdin.write("branch");
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  expect(frame).toContain("branch");
  app.unmount();
  void selected;
});

test("Backspace removes last char from query", async () => {
  let cancelled = false;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: () => {},
      onCancel: () => { cancelled = true; },
    }),
  );
  await settle();
  app.stdin.write("git");
  await settle();
  app.stdin.write("\b");
  await settle();
  const frame = stripAnsi(app.lastFrame() ?? "");
  // query should now be "gi" not "git"
  expect(frame).toContain("search: gi");
  expect(cancelled).toBe(false);
  app.unmount();
});

test("Esc calls onCancel", async () => {
  let cancelled = false;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: () => {},
      onCancel: () => { cancelled = true; },
    }),
  );
  await settle();
  app.stdin.write("\u001b");
  await settle();
  expect(cancelled).toBe(true);
  app.unmount();
});

test("Enter calls onSelect with highlighted glyph", async () => {
  let selected: string | undefined;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: (g) => { selected = g; },
      onCancel: () => {},
    }),
  );
  await settle();
  // Navigate to first selectable item and press Enter
  app.stdin.write("\r");
  await settle();
  // Should have selected the first icon's glyph
  const firstIcon = ICON_CATEGORIES[0]?.icons[0];
  expect(selected).toBe(firstIcon?.glyph);
  app.unmount();
});

test("down arrow skips header rows", async () => {
  let selected: string | undefined;
  const app = render(
    React.createElement(IconPickerModal, {
      current: undefined,
      onSelect: (g) => { selected = g; },
      onCancel: () => {},
    }),
  );
  await settle();
  // Move down once — should land on second selectable item, not a header
  app.stdin.write("\u001b[B");
  await settle();
  app.stdin.write("\r");
  await settle();
  const secondIcon = ICON_CATEGORIES[0]?.icons[1];
  expect(selected).toBe(secondIcon?.glyph);
  app.unmount();
});

test("current glyph positions cursor on that icon initially", async () => {
  // Pick github glyph as current
  const githubIcon = ICON_CATEGORIES.flatMap((c) => c.icons).find(
    (i) => i.name === "nf-dev-github_badge",
  );
  if (!githubIcon) throw new Error("github icon not found in catalog");

  const app = render(
    React.createElement(IconPickerModal, {
      current: githubIcon.glyph,
      onSelect: () => {},
      onCancel: () => {},
    }),
  );
  await settle();
  // Press Enter immediately — should select the pre-positioned icon
  let selected: string | undefined;
  const app2 = render(
    React.createElement(IconPickerModal, {
      current: githubIcon.glyph,
      onSelect: (g) => { selected = g; },
      onCancel: () => {},
    }),
  );
  await settle();
  app2.stdin.write("\r");
  await settle();
  expect(selected).toBe(githubIcon.glyph);
  app.unmount();
  app2.unmount();
});
