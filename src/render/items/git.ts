import type { PulseSnapshot } from "../../core/types.ts";
import type { Item } from "../../config/schema.ts";

export const gitBranchRenderer = (snap: PulseSnapshot, item: Item): string => {
  const git = snap.git;
  if (!git || !git.branch) return item.hide_when_empty ? "" : "—";
  const dirty = git.is_dirty ? item.options?.git_dirty_marker ?? "*" : "";
  let tail = "";
  if (item.options?.git_show_ahead_behind !== false) {
    if (git.ahead > 0) tail += `/+${git.ahead}`;
    if (git.behind > 0) tail += `/-${git.behind}`;
  }
  return `${git.branch}${dirty}${tail}`;
};
