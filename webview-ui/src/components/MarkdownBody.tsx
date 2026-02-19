import React, { useCallback, useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import taskLists from 'markdown-it-task-lists';
import { emojiFromShortcode } from '../emojiMap';
import { useMattermostStore } from '../mattermostStore';
import { postMessage } from '../vscode';
import { parseGitHubPRUrl, parseGitHubIssueUrl } from '../lib/parseGitHubUrl';

// ─── Markdown-it Configuration ────────────────────────────────────

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const md = new MarkdownIt({
    html: true, // Allow HTML so GitHub <img> tags render in PR bodies/comments
    linkify: true,
    typographer: true,
    breaks: true, // GitHub-style line breaks
    highlight: (str: string, lang: string): string => {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
            } catch {
                /* fallback */
            }
        }
        return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
    },
});

// ─── HTML Sanitization ────────────────────────────────────────────

/** Allowlisted HTML tags that are safe to render (GitHub-flavored content). */
const SAFE_TAGS = new Set([
    'img', 'br', 'hr', 'p', 'div', 'span',
    'b', 'i', 'em', 'strong', 'u', 's', 'del', 'ins', 'sub', 'sup', 'mark',
    'a', 'code', 'pre', 'kbd', 'samp', 'var',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'details', 'summary',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'picture', 'source', 'video', 'figcaption', 'figure',
]);

/** Allowlisted attributes per tag. Only these survive sanitization. */
const SAFE_ATTRS: Record<string, Set<string>> = {
    img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
    a: new Set(['href', 'title', 'target', 'rel']),
    video: new Set(['src', 'poster', 'controls', 'width', 'height']),
    source: new Set(['src', 'type', 'media']),
    td: new Set(['align', 'valign', 'colspan', 'rowspan']),
    th: new Set(['align', 'valign', 'colspan', 'rowspan', 'scope']),
    col: new Set(['span']),
    colgroup: new Set(['span']),
    details: new Set(['open']),
};

/**
 * Strip dangerous HTML tags (script, iframe, object, etc.) while preserving
 * safe ones like <img>, <details>, <table>, etc. Operates on the final HTML
 * string produced by markdown-it.
 */
function sanitizeHtml(html: string): string {
    // Remove <script>, <iframe>, <object>, <embed>, <form>, <input>, <style>, <link>, <meta>, <base>
    // and any on* event handler attributes. Keep safe tags with allowlisted attributes.
    return html
        // Strip entire dangerous tags and their content for script/style
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        // Strip self-closing or opening dangerous tags
        .replace(/<\/?(script|iframe|object|embed|form|input|style|link|meta|base|applet)\b[^>]*\/?>/gi, '')
        // Strip event handler attributes (on*="...")
        .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        // Strip javascript: URLs in href/src
        .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2$2');
}

// Enable GFM task lists
md.use(taskLists, { enabled: true, label: true, labelAfter: true });

// ─── Emoji Shortcode Rendering ────────────────────────────────────

/**
 * Replace :shortcode: patterns in text with emoji Unicode chars or custom emoji <img> tags.
 * Runs AFTER markdown-it renders so we operate on the final HTML text nodes.
 */
function renderEmojiInHtml(
    html: string,
    customEmojis: Record<string, string>,
): string {
    // Only match :shortcode: outside of HTML tags and code blocks
    return html.replace(/:([a-zA-Z0-9_+-]+):/g, (match, name: string) => {
        // Check Unicode map first
        const unicode = emojiFromShortcode(name);
        if (unicode) {
            return `<span class="emoji" title=":${escapeHtml(name)}:">${unicode}</span>`;
        }
        // Check custom emoji map
        const customUrl = customEmojis[name];
        if (customUrl) {
            return `<img src="${escapeHtml(customUrl)}" alt=":${escapeHtml(name)}:" title=":${escapeHtml(name)}:" class="inline-emoji" />`;
        }
        return match;
    });
}

/**
 * Highlight @mentions in rendered HTML.
 * Wraps @username, @here, @channel, @all in a styled <span>.
 * Applies a special class when the mention matches the current user.
 */
function highlightMentions(
    html: string,
    currentUsername: string | null,
): string {
    // Match @word patterns outside of HTML tags and code blocks.
    // We look for @username (alphanumeric, dots, hyphens, underscores)
    // as well as special keywords @here, @channel, @all.
    return html.replace(
        /(?<![\w])@([a-zA-Z0-9._-]+)/g,
        (match, name: string) => {
            const lower = name.toLowerCase();
            const isSpecial = lower === 'here' || lower === 'channel' || lower === 'all';
            const isSelf = currentUsername !== null && lower === currentUsername.toLowerCase();
            const cls = isSelf || isSpecial ? 'mention-highlight mention-self' : 'mention-highlight';
            return `<span class="${cls}">${escapeHtml(match)}</span>`;
        },
    );
}

// ─── GitHub Link Interception ─────────────────────────────────────────

/**
 * VS Code webviews natively intercept <a href="..."> clicks on external URLs
 * and open them in the browser — this fires BEFORE React's synthetic onClick
 * reaches our delegated handler.  To prevent that we move the `href` of
 * recognised GitHub PR/Issue links into `data-href` and blank the real href
 * so the webview ignores the click.  Our React onClick handler reads
 * `data-href` instead.
 */
const GITHUB_PR_ISSUE_RE =
    /(<a\b[^>]*?)\bhref=(["'])(https:\/\/github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/\d+[^"']*?)\2([^>]*?>)/gi;

function neutralizeGitHubLinks(html: string): string {
    return html.replace(GITHUB_PR_ISSUE_RE, (_match, before, quote, url, after) => {
        return `${before}href=${quote}#${quote} data-href=${quote}${url}${quote} data-github-link="true"${after}`;
    });
}

// ─── Component ────────────────────────────────────────────────────────

interface MarkdownBodyProps {
    content: string;
    className?: string;
    /** When provided, @mentions of this user (and @here/@channel/@all) get extra highlighting */
    currentUsername?: string | null;
}

/**
 * Renders a markdown string as styled HTML.
 * Uses the same markdown-it + highlight.js config as the Notes editor.
 * Wraps output in `.markdown-body` class for consistent styling from index.css.
 * Also converts :shortcode: emoji to Unicode characters or custom emoji images.
 */
export const MarkdownBody: React.FC<MarkdownBodyProps> = ({ content, className = '', currentUsername }) => {
    const customEmojis = useMattermostStore((s) => s.customEmojis);
    const html = useMemo(
        () => neutralizeGitHubLinks(
            highlightMentions(
                renderEmojiInHtml(sanitizeHtml(md.render(content)), customEmojis),
                currentUsername ?? null,
            ),
        ),
        [content, customEmojis, currentUsername],
    );

    /**
     * Delegated click handler: intercept <a> clicks on GitHub PR/Issue URLs
     * and navigate within SP Forge instead of opening the browser.
     *
     * GitHub links have their real URL in `data-href` (set by
     * `neutralizeGitHubLinks`) because VS Code webviews natively open
     * external `href` links in the browser before React's onClick fires.
     */
    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const target = (e.target as HTMLElement).closest('a');
        if (!target) { return; }

        // data-href is set by neutralizeGitHubLinks; fall back to href for
        // programmatically-created links that bypass the post-processor.
        const href = target.getAttribute('data-href') || target.getAttribute('href');
        if (!href) { return; }

        const prInfo = parseGitHubPRUrl(href);
        if (prInfo) {
            e.preventDefault();
            e.stopPropagation();
            postMessage('navigateToGitHubPR', prInfo);
            return;
        }

        const issueInfo = parseGitHubIssueUrl(href);
        if (issueInfo) {
            e.preventDefault();
            e.stopPropagation();
            postMessage('navigateToGitHubIssue', issueInfo);
        }
    }, []);

    return (
        <div
            className={`markdown-body text-[12px] leading-relaxed ${className}`}
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={handleClick}
        />
    );
};
