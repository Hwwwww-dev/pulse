import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PulseConfig } from "../../config/schema.ts";
import { THEMES } from "../../config/themes.ts";

export interface SettingsPageProps {
  config: PulseConfig;
  onChange: (next: PulseConfig) => void;
}

type FieldKey = "theme" | "default_separator" | "git_cache_ttl_ms";
const FIELDS: readonly FieldKey[] = [
  "theme",
  "default_separator",
  "git_cache_ttl_ms",
] as const;

const SEP_PRESETS: readonly string[] = [" ", " | ", " · ", " > ", " / ", "  ", " • "];

// Preset rungs for the git-status disk-cache TTL. 0 means "no cache,
// always spawn `git status`" (legacy behaviour). Large repos under
// active refresh (refreshInterval=1) typically want 1–5s.
const GIT_CACHE_TTL_PRESETS: readonly number[] = [0, 500, 1000, 2000, 5000, 10000];

function displaySep(s: string): string {
  return s.replace(/ /g, "␣");
}

function displayGitTtl(ms: number): string {
  if (ms <= 0) return "off";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

function cycleGitTtl(current: number, dir: 1 | -1): number {
  // Snap an unknown value to the nearest preset before cycling so users
  // who hand-edited config.json still get sensible ←→ behaviour.
  let idx = GIT_CACHE_TTL_PRESETS.indexOf(current);
  if (idx < 0) {
    let best = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < GIT_CACHE_TTL_PRESETS.length; i++) {
      const d = Math.abs(GIT_CACHE_TTL_PRESETS[i]! - current);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    idx = best;
  }
  const next = (idx + dir + GIT_CACHE_TTL_PRESETS.length) % GIT_CACHE_TTL_PRESETS.length;
  return GIT_CACHE_TTL_PRESETS[next]!;
}

export function SettingsPage({ config, onChange }: SettingsPageProps): React.ReactElement {
  const [focus, setFocus] = useState<number>(0);
  const activeField = FIELDS[focus] ?? "theme";

  useInput((input, key) => {
    if (key.upArrow) { setFocus((f) => (f - 1 + FIELDS.length) % FIELDS.length); return; }
    if (key.downArrow) { setFocus((f) => (f + 1) % FIELDS.length); return; }

    if (activeField === "theme" && (key.leftArrow || key.rightArrow)) {
      const names = Object.keys(THEMES);
      const idx = names.indexOf(config.theme);
      const safeIdx = idx < 0 ? 0 : idx;
      const nextIdx = key.rightArrow
        ? (safeIdx + 1) % names.length
        : (safeIdx - 1 + names.length) % names.length;
      const next = names[nextIdx];
      if (next && next !== config.theme) onChange({ ...config, theme: next });
      return;
    }

    if (activeField === "default_separator") {
      // ←→ cycles presets; typing characters appends to a custom string;
      // backspace pops the last char (clamped to "").
      if (key.leftArrow || key.rightArrow) {
        const idx = SEP_PRESETS.indexOf(config.default_separator);
        const safeIdx = idx < 0 ? 0 : idx;
        const nextIdx = key.rightArrow
          ? (safeIdx + 1) % SEP_PRESETS.length
          : (safeIdx - 1 + SEP_PRESETS.length) % SEP_PRESETS.length;
        const next = SEP_PRESETS[nextIdx];
        if (next !== undefined) onChange({ ...config, default_separator: next });
        return;
      }
      if (key.backspace || key.delete) {
        onChange({ ...config, default_separator: config.default_separator.slice(0, -1) });
        return;
      }
      if (!key.ctrl && !key.meta && input.length > 0) {
        onChange({ ...config, default_separator: config.default_separator + input });
        return;
      }
    }

    if (activeField === "git_cache_ttl_ms" && (key.leftArrow || key.rightArrow)) {
      // Default 1000ms when unset — same fallback as renderCore.
      const current = config.git.cache_ttl_ms ?? 1000;
      const next = cycleGitTtl(current, key.rightArrow ? 1 : -1);
      if (next !== current) {
        onChange({
          ...config,
          git: { ...config.git, cache_ttl_ms: next },
        });
      }
      return;
    }

  });

  const marker = (f: FieldKey): string => (activeField === f ? "▸" : " ");
  const gitTtl = config.git.cache_ttl_ms ?? 1000;

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { bold: true }, "Settings"),
    React.createElement(
      Text,
      null,
      `${marker("theme")} theme:              ⟨ ${config.theme} ⟩`,
    ),
    React.createElement(
      Text,
      null,
      `${marker("default_separator")} default_separator:  "${displaySep(config.default_separator)}"`,
    ),
    React.createElement(
      Text,
      null,
      `${marker("git_cache_ttl_ms")} git cache TTL:      ⟨ ${displayGitTtl(gitTtl)} ⟩`,
    ),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(
        Text,
        { dimColor: true },
        " ↑↓ field · ←→ cycle/adjust · type to customize separator · Backspace deletes · ␣ = space",
      ),
    ),
    React.createElement(
      Box,
      null,
      React.createElement(
        Text,
        { dimColor: true },
        " git cache: 0 = always spawn (legacy) · 1s default · raise on slow / large repos",
      ),
    ),
  );
}
