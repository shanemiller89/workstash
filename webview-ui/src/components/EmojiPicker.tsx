import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMattermostStore, type MattermostEmojiData } from '../mattermostStore';
import { postMessage } from '../vscode';
import { emojiFromShortcode } from '../emojiMap';
import { X, Search, Smile } from 'lucide-react';

/** Common system emoji shortcuts (no API call needed) */
const QUICK_EMOJIS = [
    { name: '+1', char: '👍' },
    { name: '-1', char: '👎' },
    { name: 'heart', char: '❤️' },
    { name: 'laughing', char: '😆' },
    { name: 'tada', char: '🎉' },
    { name: 'thinking_face', char: '🤔' },
    { name: 'eyes', char: '👀' },
    { name: 'rocket', char: '🚀' },
    { name: 'white_check_mark', char: '✅' },
    { name: 'fire', char: '🔥' },
    { name: 'clap', char: '👏' },
    { name: 'wave', char: '👋' },
    { name: 'pray', char: '🙏' },
    { name: 'raised_hands', char: '🙌' },
    { name: '100', char: '💯' },
    { name: 'sob', char: '😭' },
    { name: 'joy', char: '😂' },
    { name: 'sunglasses', char: '😎' },
    { name: 'skull', char: '💀' },
    { name: 'muscle', char: '💪' },
];

interface EmojiPickerProps {
    /** The post ID to add/remove reaction for */
    postId: string;
    /** Called when the picker should close */
    onClose: () => void;
    /** Position hint for the popover */
    anchorEl?: HTMLElement | null;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ postId, onClose }) => {
    const emojiSuggestions = useMattermostStore((s) => s.emojiSuggestions);
    const [search, setSearch] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Debounced search for server emoji autocomplete
    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setSearch(term);
        if (debounceRef.current) { clearTimeout(debounceRef.current); }
        if (term.length >= 2) {
            debounceRef.current = setTimeout(() => {
                postMessage('mattermost.emojiAutocomplete', { name: term });
            }, 300);
        }
    }, []);

    const handleSelectEmoji = useCallback((emojiName: string) => {
        postMessage('mattermost.addReaction', { postId, emojiName });
        onClose();
    }, [postId, onClose]);

    // Filter quick emojis by search term
    const filteredQuick = search
        ? QUICK_EMOJIS.filter((e) => e.name.includes(search.toLowerCase()))
        : QUICK_EMOJIS;

    // Server suggestions (custom + system from API)
    const serverSuggestions = search.length >= 2 ? emojiSuggestions : [];

    return (
        <div
            ref={containerRef}
            className="absolute z-50 bottom-full mb-1 right-0 w-64 rounded-lg shadow-lg border
                bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))]
                border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))]
                overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)]">
                <Smile size={14} className="text-fg/50 shrink-0" />
                <span className="text-xs font-semibold flex-1">Add Reaction</span>
                <button onClick={onClose} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-fg/50">
                    <X size={12} />
                </button>
            </div>

            {/* Search */}
            <div className="px-2 py-1.5 border-b border-[var(--vscode-panel-border)]">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded
                    bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]">
                    <Search size={11} className="text-fg/40 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={handleSearchChange}
                        placeholder="Search emoji…"
                        className="flex-1 bg-transparent text-xs outline-none text-[var(--vscode-input-foreground)] placeholder:text-fg/40"
                    />
                </div>
            </div>

            {/* Emoji grid */}
            <div className="max-h-48 overflow-y-auto p-2">
                {/* Quick emojis */}
                {filteredQuick.length > 0 && (
                    <>
                        {!search && (
                            <div className="text-[10px] text-fg/40 px-1 mb-1 uppercase tracking-wider">
                                Frequently Used
                            </div>
                        )}
                        <div className="grid grid-cols-8 gap-0.5">
                            {filteredQuick.map((emoji) => (
                                <button
                                    key={emoji.name}
                                    onClick={() => handleSelectEmoji(emoji.name)}
                                    title={`:${emoji.name}:`}
                                    className="w-7 h-7 flex items-center justify-center rounded
                                        hover:bg-[var(--vscode-list-hoverBackground)] text-sm transition-colors"
                                >
                                    {emoji.char}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Server autocomplete results */}
                {serverSuggestions.length > 0 && (
                    <>
                        <div className="text-[10px] text-fg/40 px-1 mt-2 mb-1 uppercase tracking-wider">
                            Custom & More
                        </div>
                        <div className="space-y-0.5">
                            {serverSuggestions.map((emoji) => {
                                const unicode = emojiFromShortcode(emoji.name);
                                return (
                                    <button
                                        key={emoji.name}
                                        onClick={() => handleSelectEmoji(emoji.name)}
                                        className="w-full flex items-center gap-2 px-2 py-1 rounded text-left
                                            hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                                    >
                                        {unicode ? (
                                            <span className="text-sm w-5 text-center">{unicode}</span>
                                        ) : emoji.imageUrl ? (
                                            <img src={emoji.imageUrl} alt={emoji.name} className="w-5 h-5 object-contain" />
                                        ) : (
                                            <span className="w-5 text-center text-fg/30">•</span>
                                        )}
                                        <span className="text-xs font-mono text-fg/60">:{emoji.name}:</span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* Empty state */}
                {filteredQuick.length === 0 && serverSuggestions.length === 0 && (
                    <div className="text-center text-xs text-fg/40 py-4">
                        No emoji found
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Small button that triggers the emoji picker.
 * Intended for use in message action bars.
 */
export const EmojiPickerButton: React.FC<{ postId: string }> = ({ postId }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-fg/40"
                title="Add reaction"
            >
                <Smile size={12} />
            </button>
            {open && (
                <EmojiPicker
                    postId={postId}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};

/**
 * Emoji picker for the compose bar — inserts `:shortcode:` into the textarea
 * instead of adding a reaction to a post.
 */
export const ComposeEmojiPicker: React.FC<{
    onSelect: (shortcode: string) => void;
    onClose: () => void;
}> = ({ onSelect, onClose }) => {
    const emojiSuggestions = useMattermostStore((s) => s.emojiSuggestions);
    const [search, setSearch] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setSearch(term);
        if (debounceRef.current) { clearTimeout(debounceRef.current); }
        if (term.length >= 2) {
            debounceRef.current = setTimeout(() => {
                postMessage('mattermost.emojiAutocomplete', { name: term });
            }, 300);
        }
    }, []);

    const handleSelectEmoji = useCallback((emojiName: string) => {
        onSelect(`:${emojiName}: `);
        onClose();
    }, [onSelect, onClose]);

    const filteredQuick = search
        ? QUICK_EMOJIS.filter((e) => e.name.includes(search.toLowerCase()))
        : QUICK_EMOJIS;

    const serverSuggestions = search.length >= 2 ? emojiSuggestions : [];

    return (
        <div
            ref={containerRef}
            className="absolute z-50 bottom-full mb-1 left-0 w-64 rounded-lg shadow-lg border
                bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))]
                border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))]
                overflow-hidden"
        >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)]">
                <Smile size={14} className="text-fg/50 shrink-0" />
                <span className="text-xs font-semibold flex-1">Insert Emoji</span>
                <button onClick={onClose} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-fg/50">
                    <X size={12} />
                </button>
            </div>
            <div className="px-2 py-1.5 border-b border-[var(--vscode-panel-border)]">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded
                    bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]">
                    <Search size={11} className="text-fg/40 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={handleSearchChange}
                        placeholder="Search emoji…"
                        className="flex-1 bg-transparent text-xs outline-none text-[var(--vscode-input-foreground)] placeholder:text-fg/40"
                    />
                </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-2">
                {filteredQuick.length > 0 && (
                    <>
                        {!search && (
                            <div className="text-[10px] text-fg/40 px-1 mb-1 uppercase tracking-wider">
                                Frequently Used
                            </div>
                        )}
                        <div className="grid grid-cols-8 gap-0.5">
                            {filteredQuick.map((emoji) => (
                                <button
                                    key={emoji.name}
                                    onClick={() => handleSelectEmoji(emoji.name)}
                                    title={`:${emoji.name}:`}
                                    className="w-7 h-7 flex items-center justify-center rounded
                                        hover:bg-[var(--vscode-list-hoverBackground)] text-sm transition-colors"
                                >
                                    {emoji.char}
                                </button>
                            ))}
                        </div>
                    </>
                )}
                {serverSuggestions.length > 0 && (
                    <>
                        <div className="text-[10px] text-fg/40 px-1 mt-2 mb-1 uppercase tracking-wider">
                            Custom & More
                        </div>
                        <div className="space-y-0.5">
                            {serverSuggestions.map((emoji) => {
                                const unicode = emojiFromShortcode(emoji.name);
                                return (
                                    <button
                                        key={emoji.name}
                                        onClick={() => handleSelectEmoji(emoji.name)}
                                        className="w-full flex items-center gap-2 px-2 py-1 rounded text-left
                                            hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                                    >
                                        {unicode ? (
                                            <span className="text-sm w-5 text-center">{unicode}</span>
                                        ) : emoji.imageUrl ? (
                                            <img src={emoji.imageUrl} alt={emoji.name} className="w-5 h-5 object-contain" />
                                        ) : (
                                            <span className="w-5 text-center text-fg/30">•</span>
                                        )}
                                        <span className="text-xs font-mono text-fg/60">:{emoji.name}:</span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
                {filteredQuick.length === 0 && serverSuggestions.length === 0 && (
                    <div className="text-center text-xs text-fg/40 py-4">
                        No emoji found
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Compose bar emoji picker button — opens ComposeEmojiPicker.
 */
export const ComposeEmojiPickerButton: React.FC<{
    onInsert: (shortcode: string) => void;
}> = ({ onInsert }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-fg/50"
                title="Insert emoji"
            >
                <Smile size={14} />
            </button>
            {open && (
                <ComposeEmojiPicker
                    onSelect={onInsert}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};
