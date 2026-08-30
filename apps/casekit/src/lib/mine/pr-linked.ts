import type { GitHubClient } from "../github.js";

/** applied per-candidate, only called for commits that already survived cheaper filters so volume stays small */
export async function isPrLinked(
  client: GitHubClient,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<boolean> {
  const { data: pulls } = await client.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
    owner,
    repo,
    commit_sha: commitSha,
  });
  return pulls.some((pull) => pull.merged_at !== null);
}
