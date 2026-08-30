export interface OwnerRepo {
  owner: string;
  repo: string;
}

const GITHUB_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;

/** takes either an owner/name slug or a github url, since repos.yaml records urls and the cli takes slugs */
export function requireOwnerRepo(id: string): OwnerRepo {
  const segments = id
    .replace(GITHUB_URL_PREFIX, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  const [owner, repo] = segments;
  if (segments.length !== 2 || !owner || !repo) {
    throw new Error(`"${id}" is not an owner/name pair or a github repo url`);
  }
  return { owner, repo };
}
