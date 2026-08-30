import { Octokit } from "octokit";
import { logger } from "logger";

export interface RateBudget {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface GitHubClient {
  octokit: Octokit;
  /** reads /rate_limit to prevent calling github when we're over the limit */
  budget(): Promise<{ authenticated: boolean; core: RateBudget; search: RateBudget }>;
}

/** octokit already bundles retry and throttling for both of github's rate limits */
export function createGitHubClient(token: string | undefined): GitHubClient {
  const octokit = new Octokit({
    auth: token,
    userAgent: "casekit",
    retry: { doNotRetry: [] },
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
        logger.warn(
          `github: rate limit hit on ${options.method} ${options.url}, waiting ${retryAfter}s`,
        );
        return true;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
        logger.warn(
          `github: secondary rate limit hit on ${options.method} ${options.url}, waiting ${retryAfter}s`,
        );
        return true;
      },
    },
  });

  return {
    octokit,
    async budget(): Promise<{ authenticated: boolean; core: RateBudget; search: RateBudget }> {
      const { data } = await octokit.rest.rateLimit.get();
      const read = (raw: { limit: number; remaining: number; reset: number }): RateBudget => ({
        limit: raw.limit,
        remaining: raw.remaining,
        resetAt: new Date(raw.reset * 1_000),
      });
      return {
        authenticated: Boolean(token),
        core: read(data.resources.core),
        search: read(data.resources.search),
      };
    },
  };
}

/** octokit throws on a 404 instead of returning null, so callers must catch and interpret it */
export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
