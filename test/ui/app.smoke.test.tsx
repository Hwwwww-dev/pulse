import { test, expect, beforeEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { rm } from "fs/promises";
import { App } from "../../src/ui/App.tsx";
import { paths } from "../../src/core/paths.ts";
import { stripAnsi } from "../../src/render/ansi.ts";

beforeEach(async () => {
  (Bun.env as Record<string, string>).HOME = `${Bun.env.TMPDIR ?? "/tmp"}/pulse-ui-test`;
  await rm(paths.root(), { recursive: true, force: true });
});

test("App mounts and shows Pulse title + preview", async () => {
  const { lastFrame, unmount } = render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 200));
  const frame = lastFrame() ?? "";
  expect(frame).toContain("Pulse");
  expect(frame).toContain("preview");
  unmount();
});

test("App shows Layout page by default", async () => {
  const { lastFrame, unmount } = render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 200));
  const frame = lastFrame() ?? "";
  expect(frame).toContain("Layout");
  expect(frame).not.toContain("Themes");
  unmount();
});

test("editing text does not trigger global q/r/s hotkeys and updates preview live", async () => {
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 200));

  stdin.write("\r");
  await new Promise((r) => setTimeout(r, 50));
  stdin.write("qrs");
  await new Promise((r) => setTimeout(r, 100));

  const frame = lastFrame() ?? "";
  expect(frame).toContain('label:        "qrs"');
  // Strip ANSI before checking label+value adjacency (label and value now styled separately)
  expect(stripAnsi(frame)).toContain("qrs Opus");
  expect(frame).toContain("Pulse");

  unmount();
});
