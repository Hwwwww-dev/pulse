import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";
import { drawBar } from "./helpers.ts";

export const todosProgressRenderer = (snap: PulseSnapshot, item: Item): string => {
  const todos = snap.counters?.todos ?? [];
  if (todos.length === 0) return "";
  const total = todos.length;
  const completed = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const pending = todos.filter((t) => t.status === "pending").length;
  const mode = (item.options?.todos_mode as string | undefined) ?? "compact";
  const inner = (item.options?.parts_separator as string | undefined) ?? " ";
  let body: string;
  if (mode === "bar") {
    const pct = total === 0 ? 0 : (completed / total) * 100;
    // Bar↔count: hardcoded 2 spaces, never affected by parts_separator.
    body = `${drawBar(pct, item)}  ${completed}/${total}`;
  } else if (mode === "detail") {
    body = `${total}:${inner}${completed}\u2713${inner}${inProgress}\u00b7${inner}${pending}\u25cb`;
  } else {
    body = `${completed}/${total}${inner}done`;
  }
  if (item.options?.todos_show_current) {
    const current = todos.find((t) => t.status === "in_progress");
    if (current) {
      const max = (item.options?.todos_current_max as number | undefined) ?? 40;
      const text = current.content.length > max
        ? current.content.slice(0, max - 1) + "\u2026"
        : current.content;
      body += `${inner}\u00bb${inner}${text}`;
    }
  }
  return body;
};
