import { existsSync } from "node:fs";
import { git } from "casekit-core";
import { logger } from "logger";

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

export interface RawCommit {
  sha: string;
  parents: string[];
  authorDateIso: string;
  subject: string;
}

/** one day before cutoff, so parents exist for parentTypechecks to check out */
function fetchBoundary(cutoffDate: string): string {
  const d = new Date(`${cutoffDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** shallow-since deepens the mirror only as far back as the cutoff, mining needs nothing older */
export function ensureMinedHistory(mirror: string, url: string, cutoffDate: string): void {
  const since = fetchBoundary(cutoffDate);
  if (!existsSync(mirror)) {
    logger.info(`mine: cloning ${mirror} (shallow since ${since})`);
    git(".", ["clone", "--single-branch", "--no-tags", `--shallow-since=${since}`, url, mirror]);
    return;
  }
  logger.info(`mine: deepening ${mirror} to ${since}`);
  git(mirror, ["fetch", `--shallow-since=${since}`, "origin"]);
  git(mirror, ["reset", "--hard", "origin/HEAD"]);
}

/** author date not commit date, git log --since is commit-date based and would admit rebased-in commits */
export function listCommitsSince(mirror: string, cutoffDate: string): RawCommit[] {
  const format = ["%H", "%P", "%aI", "%s"].join(FIELD_SEP);
  const raw = git(mirror, [
    "log",
    "origin/HEAD",
    `--since=${cutoffDate}`,
    `--pretty=format:${format}${RECORD_SEP}`,
  ]);
  if (raw.length === 0) return [];

  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);
  return raw
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record): RawCommit => {
      const [sha, parents, authorDateIso, subject] = record.split(FIELD_SEP);
      return {
        sha: sha ?? "",
        parents: (parents ?? "").split(" ").filter((p) => p.length > 0),
        authorDateIso: authorDateIso ?? "",
        subject: subject ?? "",
      };
    })
    .filter((commit) => new Date(commit.authorDateIso) > cutoff);
}
