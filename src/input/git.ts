import type { GitInfo } from "../core/types.ts";

async function runGit(cwd: string, args: string[], timeoutMs: number): Promise<string | null> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = new Promise<null>((resolve) =>
    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
      resolve(null);
    }, timeoutMs),
  );
  const reader = (async (): Promise<string | null> => {
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return code === 0 ? out : null;
  })();
  return Promise.race([reader, timer]);
}

export async function readGitInfo(cwd: string, timeoutMs: number): Promise<GitInfo | undefined> {
  const out = await runGit(cwd, ["status", "--porcelain=v2", "-b"], timeoutMs);
  if (out === null) return undefined;

  let branch: string | undefined;
  let ahead = 0;
  let behind = 0;
  let dirty = false;
  // Windows git.exe may emit CRLF; split tolerates either.
  for (const raw of out.split(/\r?\n/)) {
    if (!raw) continue;
    if (raw.startsWith("# branch.head")) {
      const name = raw.slice("# branch.head ".length).trim();
      if (name !== "(detached)") branch = name;
      continue;
    }
    if (raw.startsWith("# branch.ab")) {
      const m = raw.match(/# branch\.ab \+(-?\d+) -(-?\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
      continue;
    }
    if (raw.startsWith("#")) continue;
    dirty = true;
  }

  return { ...(branch !== undefined ? { branch } : {}), is_dirty: dirty, ahead, behind };
}
