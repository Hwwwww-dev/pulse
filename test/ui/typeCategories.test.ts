import { test, expect } from "bun:test";
import { ItemTypeSchema } from "../../src/config/schema.ts";
import type { ItemType } from "../../src/config/schema.ts";
import { ITEM_TYPE_CATEGORIES } from "../../src/ui/data/itemTypeCategories.ts";
import { ITEM_TYPE_DESCRIPTIONS } from "../../src/ui/data/itemTypeDescriptions.ts";

test("every ItemType is in exactly one category", () => {
  const all: Set<string> = new Set(ItemTypeSchema.options);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const cat of ITEM_TYPE_CATEGORIES) {
    for (const t of cat.types) {
      if (seen.has(t)) duplicates.push(t);
      seen.add(t);
    }
  }
  const missing = [...all].filter((t) => !seen.has(t));
  const extras = [...seen].filter((t) => !all.has(t));
  expect(duplicates).toEqual([]);
  expect(missing).toEqual([]);
  expect(extras).toEqual([]);
});

test("every ItemType has a description entry", () => {
  const missing = (ItemTypeSchema.options as readonly ItemType[]).filter(
    (t) => !ITEM_TYPE_DESCRIPTIONS[t] || !ITEM_TYPE_DESCRIPTIONS[t]!.summary,
  );
  expect(missing).toEqual([]);
});
