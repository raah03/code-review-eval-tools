import { Node, Project } from "ts-morph";
import type { LineRange } from "casekit-schema";

export interface PlacedFinding {
  slot: string;
  file: string;
  range: LineRange;
}

/** keyed by function start position, null at module scope counts as one shared scope */
function enclosingFunctionKey(
  project: Project,
  file: string,
  content: string,
  line: number,
): string | null {
  const sourceFile = project.getSourceFile(file) ?? project.createSourceFile(file, content);
  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, 0);
  const node = sourceFile.getDescendantAtPos(pos);
  const fn = node?.getFirstAncestor((a) => Node.isFunctionLikeDeclaration(a));
  return fn ? `${fn.getStart()}` : null;
}

/** must sit 10+ lines apart or in different functions, cross-file pairs trivially pass */
export function localityIssues(
  findings: readonly PlacedFinding[],
  contentByFile: ReadonlyMap<string, string>,
): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const issues: string[] = [];
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i] as PlacedFinding;
      const b = findings[j] as PlacedFinding;
      if (a.file !== b.file) continue;
      const gap = a.range[0] > b.range[1] ? a.range[0] - b.range[1] : b.range[0] - a.range[1];
      if (gap >= 10) continue;
      const content = contentByFile.get(a.file) ?? "";
      const fnA = enclosingFunctionKey(project, a.file, content, a.range[0]);
      const fnB = enclosingFunctionKey(project, b.file, content, b.range[0]);
      if (fnA !== null && fnB !== null && fnA !== fnB) continue;
      issues.push(
        `${a.slot} and ${b.slot} are only ${gap} line(s) apart in ${a.file} and share scope`,
      );
    }
  }
  return issues;
}
