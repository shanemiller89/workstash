/**
 * Shared time-formatting utilities for the webview.
 *
 * Three patterns are used across components:
 * - `formatRelativeTimeCompact` — "2m ago", "1h ago", "3d ago" (compact labels)
 * - `formatChatTimestamp`       — "10:30 AM", "Yesterday 10:30 AM" (chat messages)
 * - `formatRelativeTime`        — "2 min ago", "1 hour ago" (full labels, matches src/utils.ts)
 */

// ─── Compact Relative Time ────────────────────────────────────────

/**
 * Compact relative time: `just now`, `2m ago`, `3h ago`, `5d ago`, or locale date.
 * Used by NotesList, AgentTab, SummaryPane.
 */
export function formatRelativeTimeCompact(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) {return 'just now';}
    if (diffMin < 60) {return `${diffMin}m ago`;}
    if (diffHour < 24) {return `${diffHour}h ago`;}
    if (diffDay < 7) {return `${diffDay}d ago`;}
    return date.toLocaleDateString();
}

/**
 * Convenience: accepts an ISO string instead of a Date.
 */
export function formatTimeAgo(iso: string): string {
    return formatRelativeTimeCompact(new Date(iso));
}

// ─── Chat Timestamp ───────────────────────────────────────────────

/**
 * Chat-friendly timestamp: time-only for today, "Yesterday HH:MM" within 1 day,
 * weekday + time within 7 days, otherwise full date + time.
 * Used by MattermostChat, MattermostThreadPanel.
 */
export function formatChatTimestamp(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });

    if (diffDays === 0) {return timeStr;}
    if (diffDays === 1) {return `Yesterday ${timeStr}`;}
    if (diffDays < 7) {return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${timeStr}`;}
    return `${date.toLocaleDateString()} ${timeStr}`;
}

// ─── Full Relative Time (mirrors src/utils.ts) ───────────────────

/**
 * Full relative time: `just now`, `2 min ago`, `1 hour ago`, `3 days ago`,
 * `Jan 5`, or `Jan 5, 2023`.
 * Mirrors the canonical `formatRelativeTime` from `src/utils.ts` for webview use.
 */
export function formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {return 'just now';}
    if (diffMin < 60) {return `${diffMin} min ago`;}
    if (diffHour < 24) {return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;}
    if (diffDay < 7) {return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;}

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();

    if (diffDay < 365) {return `${month} ${day}`;}
    return `${month} ${day}, ${date.getFullYear()}`;
}
