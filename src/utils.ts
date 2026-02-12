import * as vscode from 'vscode';

/**
 * Format a date as a human-readable relative time string.
 * Cascade: <60s → "just now", <60m → "N min ago", <24h → "N hours ago",
 * <7d → "N days ago", <365d → "Mon DD", ≥365d → "Mon DD, YYYY"
 */
export function formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
        return 'just now';
    }
    if (diffMin < 60) {
        return `${diffMin} min ago`;
    }
    if (diffHour < 24) {
        return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
    }
    if (diffDay < 7) {
        return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();

    if (diffDay < 365) {
        return `${month} ${day}`;
    }

    return `${month} ${day}, ${date.getFullYear()}`;
}

/**
 * Read a MyStash configuration value with type safety.
 */
export function getConfig<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('mystash').get<T>(key, defaultValue);
}
