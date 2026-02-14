import React, { useMemo } from 'react';
import { useMattermostStore, type MattermostReactionData } from '../mattermostStore';
import { postMessage } from '../vscode';
import { emojiFromShortcode } from '../emojiMap';

/** Render an emoji — Unicode char, custom image, or fallback shortcode */
const EmojiDisplay: React.FC<{ name: string; size?: number }> = ({ name, size = 14 }) => {
    const customEmojis = useMattermostStore((s) => s.customEmojis);
    const unicode = emojiFromShortcode(name);
    if (unicode) {
        return <span style={{ fontSize: size }}>{unicode}</span>;
    }
    const customUrl = customEmojis[name];
    if (customUrl) {
        return <img src={customUrl} alt={`:${name}:`} title={`:${name}:`} className="inline-emoji" style={{ width: size, height: size }} />;
    }
    return <span>:{name}:</span>;
};

/** Compact reaction bar under a message — shared between Chat and ThreadPanel */
export const ReactionBar: React.FC<{ postId: string; currentUserId: string | null }> = ({ postId, currentUserId }) => {
    const reactions = useMattermostStore((s) => s.reactions[postId]);

    // Group by emoji — must be called before any early return to keep hooks stable
    const grouped = useMemo(() => {
        if (!reactions || reactions.length === 0) { return []; }
        const map = new Map<string, MattermostReactionData[]>();
        for (const r of reactions) {
            const list = map.get(r.emojiName) ?? [];
            list.push(r);
            map.set(r.emojiName, list);
        }
        return Array.from(map.entries());
    }, [reactions]);

    if (grouped.length === 0) { return null; }

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {grouped.map(([emoji, users]) => {
                const myReaction = users.some((u) => u.userId === currentUserId);
                return (
                    <button
                        key={emoji}
                        onClick={() => {
                            if (myReaction) {
                                postMessage('mattermost.removeReaction', { postId, emojiName: emoji });
                            } else {
                                postMessage('mattermost.addReaction', { postId, emojiName: emoji });
                            }
                        }}
                        title={users.map((u) => u.username).join(', ')}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                            myReaction
                                ? 'border-[var(--vscode-textLink-foreground)] bg-[var(--vscode-textLink-foreground)]/10 text-[var(--vscode-textLink-foreground)]'
                                : 'border-[var(--vscode-panel-border)] text-fg/60 hover:bg-[var(--vscode-list-hoverBackground)]'
                        }`}
                    >
                        <EmojiDisplay name={emoji} size={14} />
                        <span className="font-medium">{users.length}</span>
                    </button>
                );
            })}
        </div>
    );
};
