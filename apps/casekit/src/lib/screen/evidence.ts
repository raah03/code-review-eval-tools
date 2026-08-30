import type { ScreenEvidence, ScreenThresholds } from "casekit-schema";
import { requireOwnerRepo } from "casekit-core";
import { isNotFound, type GitHubClient } from "../github.js";
import { logger } from "logger";
import type { RepoMetadata } from "./pool.js";

/** package-level lockfiles aren't checked, workspaces resolve to one root lockfile */
const LOCKFILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "deno.lock",
];

const TSCONFIG = /^tsconfig(\..+)?\.json$/;
/** deeper tsconfigs are workspace internals, not real configs */
const MAX_TSCONFIG_DEPTH = 3;
const IGNORED_TREE_SEGMENTS = new Set([
  "node_modules",
  "fixtures",
  "__fixtures__",
  "test",
  "tests",
]);

/** matches the two default commit subject formats github uses for merged prs */
const PR_IN_SUBJECT = /\(#\d+\)/;
const PR_IN_MERGE = /^Merge pull request #\d+/;

function subjectOf(message: string): string {
  return message.split("\n", 1)[0] ?? "";
}

function referencesPull(message: string): boolean {
  const subject = subjectOf(message);
  return PR_IN_SUBJECT.test(subject) || PR_IN_MERGE.test(subject);
}

/** cheap request that covers the common single-package case */
async function readRoot(
  client: GitHubClient,
  fullName: string,
): Promise<{ lockfile: string | null; tsconfig: string | null }> {
  const { owner, repo } = requireOwnerRepo(fullName);
  try {
    const { data } = await client.octokit.rest.repos.getContent({ owner, repo, path: "" });
    const entries = Array.isArray(data) ? data : [];
    const files = entries.filter((e) => e.type === "file");
    const tsconfigs = files.filter((e) => TSCONFIG.test(e.name));
    return {
      lockfile: files.find((e) => LOCKFILES.includes(e.name))?.path ?? null,
      // several root configs pick the canonical one, the actual typecheck config
      // is decided later by repos sync
      tsconfig: (tsconfigs.find((e) => e.name === "tsconfig.json") ?? tsconfigs[0])?.path ?? null,
    };
  } catch (error) {
    if (isNotFound(error)) return { lockfile: null, tsconfig: null };
    throw error;
  }
}

/** costs one extra recursive-tree request, shallowest match wins so a fixture config doesn't */
async function findNestedTsconfig(
  client: GitHubClient,
  repo: RepoMetadata,
): Promise<{ tsconfig: string | null; truncated: boolean }> {
  const { owner, repo: repoName } = requireOwnerRepo(repo.fullName);
  try {
    const { data } = await client.octokit.rest.git.getTree({
      owner,
      repo: repoName,
      tree_sha: repo.defaultBranch,
      recursive: "1",
    });

    const candidates = data.tree
      .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
      .map((entry) => (entry.path as string).split("/"))
      .filter(
        (segments) =>
          segments.length <= MAX_TSCONFIG_DEPTH &&
          TSCONFIG.test(segments.at(-1) ?? "") &&
          !segments.some((segment) => IGNORED_TREE_SEGMENTS.has(segment)),
      )
      .sort((a, b) => a.length - b.length || a.join("/").localeCompare(b.join("/")));

    return { tsconfig: candidates[0]?.join("/") ?? null, truncated: data.truncated ?? false };
  } catch (error) {
    if (isNotFound(error)) return { tsconfig: null, truncated: false };
    throw error;
  }
}

/** only failing repos get checked against the api, it can only raise the linked count */
async function readProvenance(
  client: GitHubClient,
  repo: RepoMetadata,
  thresholds: ScreenThresholds,
  verify: boolean,
): Promise<
  Pick<
    ScreenEvidence,
    | "commitsSampled"
    | "prLinkedCommits"
    | "prLinkedRatio"
    | "provenanceVerifiedByApi"
    | "mergeCommits"
  >
> {
  const { owner, repo: repoName } = requireOwnerRepo(repo.fullName);
  const { data: commits } = await client.octokit.rest.repos.listCommits({
    owner,
    repo: repoName,
    sha: repo.defaultBranch,
    per_page: thresholds.commitSample,
  });

  const unreferenced = commits.filter((c) => !referencesPull(c.commit.message));
  let linked = commits.length - unreferenced.length;
  const ratio = (count: number) => (commits.length === 0 ? 0 : count / commits.length);

  const shouldVerify =
    verify && unreferenced.length > 0 && ratio(linked) < thresholds.minPrLinkedRatio;
  if (shouldVerify) {
    logger.debug(
      `${repo.fullName}: ${linked}/${commits.length} PR-linked by message, checking the other ${unreferenced.length} against the API`,
    );
    for (const commit of unreferenced) {
      const { data: pulls } = await client.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo: repoName,
        commit_sha: commit.sha,
      });
      if (pulls.some((pull) => pull.merged_at !== null)) linked++;
    }
  }

  return {
    commitsSampled: commits.length,
    prLinkedCommits: linked,
    prLinkedRatio: ratio(linked),
    provenanceVerifiedByApi: shouldVerify,
    mergeCommits: commits.filter((c) => c.parents.length > 1).length,
  };
}

/** runs after the metadata screen, three to four requests per repo */
export async function gatherEvidence(
  client: GitHubClient,
  repo: RepoMetadata,
  thresholds: ScreenThresholds,
  verifyProvenance: boolean,
): Promise<ScreenEvidence> {
  const root = await readRoot(client, repo.fullName);
  const nested = root.tsconfig === null ? await findNestedTsconfig(client, repo) : null;

  return {
    lockfile: root.lockfile,
    tsconfig: root.tsconfig ?? nested?.tsconfig ?? null,
    treeTruncated: nested?.truncated ?? false,
    ...(await readProvenance(client, repo, thresholds, verifyProvenance)),
  };
}
