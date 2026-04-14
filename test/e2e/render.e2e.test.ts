import { test, expect } from "bun:test";

test("bun src/cli/bin.ts reads stdin and emits statusline", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const proc = Bun.spawn(["bun", "src/cli/bin.ts"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: `${Bun.env.TMPDIR ?? "/tmp"}/pulse-e2e-home`, NO_COLOR: "1" },
  });
  proc.stdin.write(raw);
  await proc.stdin.end();
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  expect(code).toBe(0);
  expect(out).toContain("Opus");
});

test("renders within latency budget (<3000ms)", async () => {
  const raw = await Bun.file("test/fixtures/stdin/full.json").text();
  const t0 = Date.now();
  const proc = Bun.spawn(["bun", "src/cli/bin.ts"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: `${Bun.env.TMPDIR ?? "/tmp"}/pulse-e2e-home`, NO_COLOR: "1" },
  });
  proc.stdin.write(raw);
  await proc.stdin.end();
  await new Response(proc.stdout).text();
  await proc.exited;
  expect(Date.now() - t0).toBeLessThan(3000);
});
