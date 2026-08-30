import { expect, test } from "vitest";
import { rangesOverlap, sliceAroundRanges, touchedRanges, type LineRange } from "../src/index.js";

const FILE = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");

const at = (line: number): LineRange => [line, line];
const slice = (name: string, context: number, ...ranges: LineRange[]) =>
  `## ${name}\n${sliceAroundRanges(FILE, ranges, context)}`;

test("windows merge, keep gaps, and 'clamp' to the file", async () => {
  await expect(
    [
      slice("adjacent windows merge into one block", 0, at(2), at(3)),
      slice("distant windows keep an elided gap", 0, at(2), at(5)),
      slice("context clamps to the file bounds", 20, at(1)),
      slice("no ranges is the whole file", 0),
    ].join("\n\n"),
  ).toMatchFileSnapshot("__snapshots__/slices.md");
});

test("every edited hunk is touched, and only real overlaps count", async () => {
  const after = FILE.replace("b", "B").replace("h", "H");
  const observed = {
    touched: touchedRanges(FILE, after),
    overlapping: rangesOverlap([1, 2], [2, 3]),
    abutting: rangesOverlap([1, 2], [3, 4]),
  };
  await expect(JSON.stringify(observed, null, 2)).toMatchFileSnapshot("__snapshots__/ranges.json");
});
