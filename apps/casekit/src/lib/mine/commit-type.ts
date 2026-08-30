import { conventionalCommitType } from "casekit-schema";

/** git's auto-generated revert message, never carries a conventional-commit prefix */
const GIT_AUTO_REVERT = /^Revert /;

export function isRevertCommit(subject: string): boolean {
  return GIT_AUTO_REVERT.test(subject) || conventionalCommitType(subject) === "revert";
}

export function isChoreCommit(subject: string): boolean {
  return conventionalCommitType(subject) === "chore";
}

/** docs-only subjects that skip the docs: prefix entirely */
const UNPREFIXED_DOCS = /^update docs(\s|$)|^update documentation\b|\bdocs? links?\b/i;

export function isDocsCommit(subject: string): boolean {
  return conventionalCommitType(subject) === "docs" || UNPREFIXED_DOCS.test(subject);
}
