import { createHash } from "node:crypto";
import type { FindingId } from "casekit-schema";

/** ordered pairs, first deactivates at i1, second at i2 */
function orderedPairs(ids: readonly FindingId[]): [FindingId, FindingId][] {
  const pairs: [FindingId, FindingId][] = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a !== b) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** deterministic from seed and case id, not a whole-batch balanced design */
export function chooseRevertPlan(
  seed: number,
  caseId: string,
  findingIds: readonly FindingId[],
): [FindingId, FindingId] {
  const pairs = orderedPairs(findingIds);
  const hash = createHash("sha256").update(`${seed}:${caseId}`).digest();
  const index = hash.readUInt32BE(0) % pairs.length;
  return pairs[index] as [FindingId, FindingId];
}
