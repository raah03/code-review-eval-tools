import type { ScreenThresholds } from "casekit-schema";
import { requireOwnerRepo } from "casekit-core";
import { daysAgo } from "../date.js";
import { isNotFound, type GitHubClient } from "../github.js";
import { logger } from "logger";

const PER_PAGE = 100;
/** github's search api won't page past 1,000 results */
const SEARCH_RESULT_CAP = 1_000;

/** fields the metadata screen decides from, both endpoints return a superset of this */
export interface RepoMetadata {
  fullName: string;
  htmlUrl: string;
  language: string | null;
  stars: number;
  pushedAt: string;
  archived: boolean;
  fork: boolean;
  licenseSpdxId: string | null;
  /** counts full history, used only as a pre-filter */
  sizeKb: number;
  defaultBranch: string;
}

function toRepoMetadata(repo: {
  full_name: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  license: { spdx_id?: string | null } | null;
  size: number;
  default_branch?: string;
}): RepoMetadata {
  return {
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    language: repo.language,
    stars: repo.stargazers_count,
    pushedAt: repo.pushed_at,
    archived: repo.archived,
    fork: repo.fork,
    licenseSpdxId: repo.license?.spdx_id ?? null,
    sizeKb: repo.size,
    defaultBranch: repo.default_branch ?? "HEAD",
  };
}

/** built from thresholds not hardcoded, so the recorded query matches what actually ran */
export function poolQuery(thresholds: ScreenThresholds): string {
  return [
    "language:TypeScript",
    `stars:>=${thresholds.minStars}`,
    `pushed:>=${daysAgo(thresholds.pushedWithinDays)}`,
    "archived:false",
  ].join(" ");
}

export interface Pool {
  totalCount: number;
  repos: RepoMetadata[];
}

/** star-sorted, so truncating always cuts the ceiling */
export async function searchPool(
  client: GitHubClient,
  query: string,
  requested: number,
): Promise<Pool> {
  const wanted = Math.min(requested, SEARCH_RESULT_CAP);
  if (requested > SEARCH_RESULT_CAP) {
    logger.warn(`pool: GitHub caps search at ${SEARCH_RESULT_CAP} results, requesting ${wanted}`);
  }

  const repos: RepoMetadata[] = [];
  let totalCount = 0;
  for (let page = 1; repos.length < wanted; page++) {
    const perPage = Math.min(PER_PAGE, wanted - repos.length);
    const { data } = await client.octokit.rest.search.repos({
      q: query,
      sort: "stars",
      order: "desc",
      per_page: perPage,
      page,
    });
    totalCount = data.total_count;
    repos.push(...data.items.map(toRepoMetadata));
    logger.info(`pool: page ${page} → ${repos.length}/${wanted} of ${totalCount} matches`);
    if (data.items.length < perPage) break;
  }

  return { totalCount, repos: repos.slice(0, wanted) };
}

/** for --repo owner/name mode, screens one candidate without a pool snapshot.
 *  null means no such repo, a malformed id throws since that's a typo on the command line */
export async function fetchRepo(client: GitHubClient, id: string): Promise<RepoMetadata | null> {
  const { owner, repo } = requireOwnerRepo(id);
  try {
    const { data } = await client.octokit.rest.repos.get({ owner, repo });
    return toRepoMetadata(data);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
