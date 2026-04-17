const seg = new Intl.Segmenter("en", { granularity: "grapheme" });

export function graphemes(s: string): string[] {
  return Array.from(seg.segment(s), (x) => x.segment);
}
