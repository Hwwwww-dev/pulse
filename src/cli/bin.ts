#!/usr/bin/env bun
async function main(): Promise<void> {
  const isTty = process.stdin.isTTY;
  if (isTty) {
    const { runConfigUi } = await import("../ui/index.ts");
    await runConfigUi();
  } else {
    const { runRenderMode } = await import("./render-mode.ts");
    await runRenderMode();
  }
}
main().catch(() => process.exit(1));
