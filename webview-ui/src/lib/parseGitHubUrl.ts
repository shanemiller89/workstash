/**
 * Parse a GitHub pull request URL into its components.
 *
 * Matches URLs like:
 *   https://github.com/{owner}/{repo}/pull/{number}
 *   https://github.com/{owner}/{repo}/pull/{number}/files
 *   https://github.com/{owner}/{repo}/pull/{number}/commits
 *   https://github.com/{owner}/{repo}/pull/{number}#discussion_r12345
 *
 * Returns `null` if the URL is not a valid GitHub PR link.
 */
export function parseGitHubPRUrl(
    url: string,
): { owner: string; repo: string; prNumber: number } | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'github.com') {
            return null;
        }
        // pathname: /{owner}/{repo}/pull/{number}[/...]
        const match = parsed.pathname.match(
            /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
        );
        if (!match) {
            return null;
        }
        return {
            owner: match[1],
            repo: match[2],
            prNumber: parseInt(match[3], 10),
        };
    } catch {
        return null;
    }
}

/**
 * Parse a GitHub issue URL into its components.
 *
 * Matches URLs like:
 *   https://github.com/{owner}/{repo}/issues/{number}
 *
 * Returns `null` if the URL is not a valid GitHub issue link.
 */
export function parseGitHubIssueUrl(
    url: string,
): { owner: string; repo: string; issueNumber: number } | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'github.com') {
            return null;
        }
        const match = parsed.pathname.match(
            /^\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
        );
        if (!match) {
            return null;
        }
        return {
            owner: match[1],
            repo: match[2],
            issueNumber: parseInt(match[3], 10),
        };
    } catch {
        return null;
    }
}
