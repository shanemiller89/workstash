import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMattermostStore } from '../store';
import { postMessage } from '@/vscode';
import { emojiFromShortcode } from '@/emojiMap';
import { X, Search, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

// ─── Preview Bar ──────────────────────────────────────────────────

/** Hovered emoji state for the preview bar */
interface HoveredEmoji {
    name: string;
    /** Unicode character for system emoji, or undefined for custom */
    char?: string;
    /** Data URI for custom emoji image */
    imageUrl?: string;
}

/** Preview bar at the bottom showing the hovered emoji + shortcode */
const EmojiPreviewBar: React.FC<{ hovered: HoveredEmoji | null }> = ({ hovered }) => {
    if (!hovered) { return null; }
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--vscode-panel-border)] bg-fg/[0.02]">
            {hovered.char ? (
                <span className="text-2xl leading-none">{hovered.char}</span>
            ) : hovered.imageUrl ? (
                <img src={hovered.imageUrl} alt={`:${hovered.name}:`} className="w-7 h-7 object-contain" />
            ) : (
                <span className="w-7 h-7 flex items-center justify-center text-fg/30 text-lg">•</span>
            )}
            <div className="flex flex-col min-w-0">
                <span className="text-xs font-mono text-fg/70 truncate">:{hovered.name}:</span>
                {hovered.imageUrl && (
                    <span className="text-[10px] text-fg/40">Custom Emoji</span>
                )}
            </div>
        </div>
    );
};

// ─── Shared Emoji Grid ───────────────────────────────────────────

interface EmojiGridProps {
    search: string;
    onSelect: (emojiName: string) => void;
    onHover: (emoji: HoveredEmoji | null) => void;
}

/**
 * Shared emoji grid used by both EmojiPicker (reaction) and ComposeEmojiPicker.
 * Shows: Frequently Used → Custom → Server autocomplete results
 */
const EmojiGrid: React.FC<EmojiGridProps> = ({ search, onSelect, onHover }) => {
    const emojiSuggestions = useMattermostStore((s) => s.emojiSuggestions);
    const customEmojis = useMattermostStore((s) => s.customEmojis);

    // Filter quick emojis by search term
    const filteredQuick = search
        ? QUICK_EMOJIS.filter((e) => e.name.includes(search.toLowerCase()))
        : QUICK_EMOJIS;

    // Build filtered custom emoji entries from the pre-fetched store map (name → url).
    const filteredCustom = useMemo(() => {
        const entries = Object.entries(customEmojis);
        if (entries.length === 0) { return [] as Array<[string, string]>; }
        if (!search) { return entries; }
        const lowerSearch = search.toLowerCase();
        return entries.filter(([name]) => name.toLowerCase().includes(lowerSearch));
    }, [customEmojis, search]);

    // Server autocomplete suggestions (only when actively searching)
    const serverSuggestions = search.length >= 2 ? emojiSuggestions : [];

    const hasAnyResults = filteredQuick.length > 0
        || filteredCustom.length > 0
        || serverSuggestions.length > 0;

    return (
        <div className="max-h-56 overflow-y-auto p-2">
            {/* Frequently Used */}
            {filteredQuick.length > 0 && (
                <>
                    {!search && (
                        <div className="text-[10px] text-fg/40 px-1 mb-1 uppercase tracking-wider">
                            Frequently Used
                        </div>
                    )}
                    <div className="grid grid-cols-8 gap-0.5">
                        {filteredQuick.map((emoji) => (
                            <Tooltip key={emoji.name}>
                                <TooltipTrigger>
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => onSelect(emoji.name)}
                                        onMouseEnter={() => onHover({ name: emoji.name, char: emoji.char })}
                                        onMouseLeave={() => onHover(null)}
                                        className="w-7 h-7 text-sm"
                                    >
                                        {emoji.char}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px]">
                                    :{emoji.name}:
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </>
            )}

            {/* Custom Emojis (from pre-fetched store) */}
            {filteredCustom.length > 0 && (
                <>
                    <div className="text-[10px] text-fg/40 px-1 mt-2 mb-1 uppercase tracking-wider">
                        Custom
                    </div>
                    <div className="grid grid-cols-8 gap-0.5">
                        {filteredCustom.map(([name, url]) => (
                            <Tooltip key={name}>
                                <TooltipTrigger>
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => url && onSelect(name)}
                                        onMouseEnter={() => onHover(url ? { name, imageUrl: url } : { name })}
                                        onMouseLeave={() => onHover(null)}
                                        className="w-7 h-7 p-0.5"
                                        disabled={!url}
                                    >
                                        {url ? (
                                            <img
                                                src={url}
                                                alt={`:${name}:`}
                                                className="w-5 h-5 object-contain"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <span className="w-5 h-5 rounded bg-fg/10 animate-pulse" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px]">
                                    :{name}:{!url && ' (loading…)'}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </>
            )}

            {/* Server autocomplete results (search-only, fills gaps for system emoji) */}
            {serverSuggestions.length > 0 && (
                <>
                    <div className="text-[10px] text-fg/40 px-1 mt-2 mb-1 uppercase tracking-wider">
                        Search Results
                    </div>
                    <div className="space-y-0.5">
                        {serverSuggestions.map((emoji) => {
                            const unicode = emojiFromShortcode(emoji.name);
                            return (
                                <Button
                                    key={emoji.name}
                                    variant="ghost"
                                    onClick={() => onSelect(emoji.name)}
                                    onMouseEnter={() => onHover({
                                        name: emoji.name,
                                        char: unicode || undefined,
                                        imageUrl: emoji.imageUrl,
                                    })}
                                    onMouseLeave={() => onHover(null)}
                                    className="w-full justify-start gap-2 px-2 py-1 h-auto rounded text-left"
                                >
                                    {unicode ? (
                                        <span className="text-sm w-5 text-center">{unicode}</span>
                                    ) : emoji.imageUrl ? (
                                        <img src={emoji.imageUrl} alt={emoji.name} className="w-5 h-5 object-contain" />
                                    ) : (
                                        <span className="w-5 text-center text-fg/30">•</span>
                                    )}
                                    <span className="text-xs font-mono text-fg/60">:{emoji.name}:</span>
                                </Button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Empty state */}
            {!hasAnyResults && (
                <div className="text-center text-xs text-fg/40 py-4">
                    No emoji found
                </div>
            )}
        </div>
    );
};

// ─── Shared Hooks ─────────────────────────────────────────────────

/** Shared close-on-outside-click + close-on-Escape + focus-input logic */
function usePickerBehavior(
    containerRef: React.RefObject<HTMLDivElement | null>,
    inputRef: React.RefObject<HTMLInputElement | null>,
    onClose: () => void,
) {
    useEffect(() => { inputRef.current?.focus(); }, [inputRef]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [containerRef, onClose]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);
}

/** Debounced server emoji autocomplete as user types */
function useEmojiSearch() {
    const [search, setSearch] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    return { search, handleSearchChange };
}

// ─── Reaction Emoji Picker ───────────────────────────────────────

interface EmojiPickerProps {
    /** The post ID to add/remove reaction for */
    postId: string;
    /** Called when the picker should close */
    onClose: () => void;
    /** Position hint for the popover */
    anchorEl?: HTMLElement | null;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ postId, onClose }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState<HoveredEmoji | null>(null);
    const { search, handleSearchChange } = useEmojiSearch();

    usePickerBehavior(containerRef, inputRef, onClose);

    const handleSelectEmoji = useCallback((emojiName: string) => {
        postMessage('mattermost.addReaction', { postId, emojiName });
        onClose();
    }, [postId, onClose]);

    return (
        <div
            ref={containerRef}
            className="absolute z-50 bottom-full mb-1 right-0 w-72 rounded-lg shadow-lg border
                bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))]
                border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))]
                overflow-clip flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)]">
                <Smile size={14} className="text-fg/50 shrink-0" />
                <span className="text-xs font-semibold flex-1">Add Reaction</span>
                <Button variant="ghost" size="icon-xs" onClick={onClose}>
                    <X size={12} />
                </Button>
            </div>

            {/* Search */}
            <div className="px-2 py-1.5 border-b border-[var(--vscode-panel-border)]">
                <div className="flex items-center gap-1.5 relative">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/40 shrink-0" />
                    <Input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={handleSearchChange}
                        placeholder="Search emoji…"
                        className="pl-6 h-6 text-xs"
                    />
                </div>
            </div>

            {/* Emoji grid */}
            <EmojiGrid search={search} onSelect={handleSelectEmoji} onHover={setHovered} />

            {/* Preview bar */}
            <EmojiPreviewBar hovered={hovered} />
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
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setOpen(!open)}
                title="Add reaction"
            >
                <Smile size={12} />
            </Button>
            {open && (
                <EmojiPicker
                    postId={postId}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};

// ─── Compose Emoji Picker ────────────────────────────────────────

/**
 * Emoji picker for the compose bar — inserts `:shortcode:` into the textarea
 * instead of adding a reaction to a post.
 */
export const ComposeEmojiPicker: React.FC<{
    onSelect: (shortcode: string) => void;
    onClose: () => void;
}> = ({ onSelect, onClose }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState<HoveredEmoji | null>(null);
    const { search, handleSearchChange } = useEmojiSearch();

    usePickerBehavior(containerRef, inputRef, onClose);

    const handleSelectEmoji = useCallback((emojiName: string) => {
        onSelect(`:${emojiName}: `);
        onClose();
    }, [onSelect, onClose]);

    return (
        <div
            ref={containerRef}
            className="absolute z-50 bottom-full mb-1 left-0 w-72 rounded-lg shadow-lg border
                bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))]
                border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))]
                overflow-clip flex flex-col"
        >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)]">
                <Smile size={14} className="text-fg/50 shrink-0" />
                <span className="text-xs font-semibold flex-1">Insert Emoji</span>
                <Button variant="ghost" size="icon-xs" onClick={onClose}>
                    <X size={12} />
                </Button>
            </div>
            <div className="px-2 py-1.5 border-b border-[var(--vscode-panel-border)]">
                <div className="flex items-center gap-1.5 relative">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/40 shrink-0" />
                    <Input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={handleSearchChange}
                        placeholder="Search emoji…"
                        className="pl-6 h-6 text-xs"
                    />
                </div>
            </div>

            {/* Emoji grid */}
            <EmojiGrid search={search} onSelect={handleSelectEmoji} onHover={setHovered} />

            {/* Preview bar */}
            <EmojiPreviewBar hovered={hovered} />
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
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setOpen(!open)}
                title="Insert emoji"
            >
                <Smile size={14} />
            </Button>
            {open && (
                <ComposeEmojiPicker
                    onSelect={onInsert}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};
