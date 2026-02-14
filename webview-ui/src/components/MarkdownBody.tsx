import React, { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { emojiFromShortcode } from '../emojiMap';
import { useMattermostStore } from '../mattermostStore';

// ─── Markdown-it Configuration ────────────────────────────────────

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const md = new MarkdownIt({
    html: false,
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

// ─── Component ────────────────────────────────────────────────────

interface MarkdownBodyProps {
    content: string;
    className?: string;
}

/**
 * Renders a markdown string as styled HTML.
 * Uses the same markdown-it + highlight.js config as the Notes editor.
 * Wraps output in `.markdown-body` class for consistent styling from index.css.
 * Also converts :shortcode: emoji to Unicode characters or custom emoji images.
 */
export const MarkdownBody: React.FC<MarkdownBodyProps> = ({ content, className = '' }) => {
    const customEmojis = useMattermostStore((s) => s.customEmojis);
    const html = useMemo(
        () => renderEmojiInHtml(md.render(content), customEmojis),
        [content, customEmojis],
    );

    return (
        <div
            className={`markdown-body text-[12px] leading-relaxed ${className}`}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};
