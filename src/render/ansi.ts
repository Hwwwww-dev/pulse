export type ColorLevel = "none" | "16" | "256" | "truecolor";

export interface TextStyleInput {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

const NAMED_FG: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37,
  "bright-black": 90, "bright-red": 91, "bright-green": 92, "bright-yellow": 93,
  "bright-blue": 94, "bright-magenta": 95, "bright-cyan": 96, "bright-white": 97,
};
const NAMED_BG: Record<string, number> = {
  black: 40, red: 41, green: 42, yellow: 43,
  blue: 44, magenta: 45, cyan: 46, white: 47,
  "bright-black": 100, "bright-red": 101, "bright-green": 102, "bright-yellow": 103,
  "bright-blue": 104, "bright-magenta": 105, "bright-cyan": 106, "bright-white": 107,
};

// P1-3: Memoize detectColorLevel
let CACHED_LEVEL: ColorLevel | undefined;

export function detectColorLevel(): ColorLevel {
  if (CACHED_LEVEL !== undefined) return CACHED_LEVEL;
  if (Bun.env.NO_COLOR) return (CACHED_LEVEL = "none");
  if (Bun.env.COLORTERM === "truecolor" || Bun.env.COLORTERM === "24bit") return (CACHED_LEVEL = "truecolor");
  const term = Bun.env.TERM ?? "";
  if (term.includes("256")) return (CACHED_LEVEL = "256");
  if (term) return (CACHED_LEVEL = "16");
  return (CACHED_LEVEL = "truecolor");
}

// Non-exported reset for tests
function __resetColorLevelForTests(): void {
  CACHED_LEVEL = undefined;
}
// Expose via module-level symbol so tests can call it
(globalThis as Record<string, unknown>).__resetColorLevelForTests = __resetColorLevelForTests;

// P1-3: Cache hexToRgb with bounded Map (LRU-ish via insertion order)
const HEX_CACHE = new Map<string, [number, number, number] | null>();
const HEX_CACHE_MAX = 256;

export function hexToRgb(hex: string): [number, number, number] | null {
  const key = hex.toLowerCase();
  if (HEX_CACHE.has(key)) return HEX_CACHE.get(key)!;
  const m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  let result: [number, number, number] | null = null;
  if (m && m[1]) {
    let h: string = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    result = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (HEX_CACHE.size >= HEX_CACHE_MAX) {
    const firstKey = HEX_CACHE.keys().next().value;
    if (firstKey !== undefined) HEX_CACHE.delete(firstKey);
  }
  HEX_CACHE.set(key, result);
  return result;
}

// P1-3: Shared 256-color index computation
function to256Index(rgb: [number, number, number]): number {
  return 16 + 36 * Math.round((rgb[0] / 255) * 5) + 6 * Math.round((rgb[1] / 255) * 5) + Math.round((rgb[2] / 255) * 5);
}

export function fgCode(color: string, level: ColorLevel): string {
  if (level === "none") return "";
  if (NAMED_FG[color] !== undefined) return `\x1b[${NAMED_FG[color]}m`;
  const rgb = hexToRgb(color);
  if (!rgb) return "";
  if (level === "truecolor") return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  return `\x1b[38;5;${to256Index(rgb)}m`;
}

export function bgCode(color: string, level: ColorLevel): string {
  if (level === "none") return "";
  if (NAMED_BG[color] !== undefined) return `\x1b[${NAMED_BG[color]}m`;
  const rgb = hexToRgb(color);
  if (!rgb) return "";
  if (level === "truecolor") return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  return `\x1b[48;5;${to256Index(rgb)}m`;
}

// P0-1: applyStyle reset uses sequential single-param SGRs (no \x1b[0m which
// clears line bg). Multi-param form `\x1b[22;23;24;27;39;49m` is valid ANSI but
// trips Ink's text parser (drops digits, leaks trailing `m`); split sequences
// are universally safe.
const RESET_SEQ = "\x1b[22m\x1b[23m\x1b[24m\x1b[27m\x1b[39m\x1b[49m";

// P1-3: Use direct string concat instead of array join
export function applyStyle(text: string, style: TextStyleInput | undefined): string {
  if (!style) return text;
  const level = detectColorLevel();
  if (level === "none") return text;
  let prefix = "";
  if (style.bold) prefix += "\x1b[1m";
  if (style.dim) prefix += "\x1b[2m";
  if (style.italic) prefix += "\x1b[3m";
  if (style.underline) prefix += "\x1b[4m";
  if (style.fg) prefix += fgCode(style.fg, level);
  if (style.bg) prefix += bgCode(style.bg, level);
  if (!prefix) return text;
  return `${prefix}${text}${RESET_SEQ}`;
}

export function applyBg(text: string, bg: string | undefined): string {
  if (!bg) return text;
  const level = detectColorLevel();
  if (level === "none") return text;
  return `${bgCode(bg, level)}${text}\x1b[49m`;
}

// P1-3: Hoist ANSI regex to module level
const ANSI_RX = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RX, "");
}
