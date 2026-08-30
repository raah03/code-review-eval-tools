const CONVENTIONAL_TYPE = /^(\w+)(?:\([^)]*\))?!?:\s/;

export function conventionalCommitType(subject: string): string | null {
  return CONVENTIONAL_TYPE.exec(subject)?.[1]?.toLowerCase() ?? null;
}
