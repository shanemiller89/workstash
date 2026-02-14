import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMattermostStore, type MattermostEmojiData } from '../mattermostStore';
import { postMessage } from '../vscode';
import { emojiFromShortcode } from '../emojiMap';

/**
 * Hook that provides `:shortcode:` autocomplete for a textarea.
 * 
 * Returns:
 * - `suggestions`: filtered emoji suggestions to show
 * - `selectedIndex`: currently highlighted suggestion
 * - `isOpen`: whether the dropdown is visible
 * - `handleKeyDown`: attach to textarea's onKeyDown
 * - `handleChange`: attach to textarea's onChange (wraps your existing onChange)
 * - `acceptSuggestion`: call to accept a suggestion at a given index
 * - `dropdownPosition`: approximate position for the dropdown
 */
export function useEmojiAutocomplete(
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    onChange: (newValue: string) => void,
) {
    const emojiSuggestions = useMattermostStore((s) => s.emojiSuggestions);
    const [isOpen, setIsOpen] = useState(false);
    const [colonStart, setColonStart] = useState<number | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // When suggestions arrive, open the dropdown if we have a search active
    useEffect(() => {
        if (colonStart !== null && emojiSuggestions.length > 0) {
            setIsOpen(true);
            setSelectedIndex(0);
        } else if (colonStart !== null && emojiSuggestions.length === 0) {
            // Keep open but empty — user might still be typing
        }
    }, [emojiSuggestions, colonStart]);

    const closeAutocomplete = useCallback(() => {
        setIsOpen(false);
        setColonStart(null);
        setSelectedIndex(0);
    }, []);

    const acceptSuggestion = useCallback(
        (index?: number) => {
            const idx = index ?? selectedIndex;
            const emoji = emojiSuggestions[idx];
            if (!emoji || colonStart === null) { return; }

            const before = value.slice(0, colonStart);
            const after = value.slice(textareaRef.current?.selectionStart ?? value.length);
            const replacement = `:${emoji.name}: `;
            const newValue = before + replacement + after;
            onChange(newValue);
            closeAutocomplete();

            // Move cursor after replacement
            requestAnimationFrame(() => {
                const pos = colonStart + replacement.length;
                textareaRef.current?.setSelectionRange(pos, pos);
            });
        },
        [selectedIndex, emojiSuggestions, colonStart, value, onChange, textareaRef, closeAutocomplete],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value;
            onChange(newValue);

            const cursor = e.target.selectionStart;
            // Look backwards from cursor for an unmatched ':'
            let foundColon = -1;
            for (let i = cursor - 1; i >= 0; i--) {
                const ch = newValue[i];
                if (ch === ':') {
                    foundColon = i;
                    break;
                }
                if (ch === ' ' || ch === '\n') { break; }
            }

            if (foundColon >= 0) {
                const query = newValue.slice(foundColon + 1, cursor);
                if (query.length >= 2 && /^[a-zA-Z0-9_+-]+$/.test(query)) {
                    setColonStart(foundColon);
                    // Debounced API call
                    if (debounceRef.current) { clearTimeout(debounceRef.current); }
                    debounceRef.current = setTimeout(() => {
                        postMessage('mattermost.emojiAutocomplete', { name: query });
                    }, 200);
                    return;
                }
            }

            // No active shortcode search
            if (isOpen) { closeAutocomplete(); }
        },
        [onChange, isOpen, closeAutocomplete],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (!isOpen || emojiSuggestions.length === 0) { return; }

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev + 1) % emojiSuggestions.length);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev - 1 + emojiSuggestions.length) % emojiSuggestions.length);
                    break;
                case 'Enter':
                case 'Tab':
                    e.preventDefault();
                    acceptSuggestion();
                    break;
                case 'Escape':
                    e.preventDefault();
                    closeAutocomplete();
                    break;
            }
        },
        [isOpen, emojiSuggestions, acceptSuggestion, closeAutocomplete],
    );

    return {
        suggestions: isOpen ? emojiSuggestions : [],
        selectedIndex,
        isOpen,
        handleKeyDown,
        handleChange,
        acceptSuggestion,
        closeAutocomplete,
    };
}

/** Dropdown UI for emoji shortcode autocomplete */
export const EmojiAutocompleteDropdown: React.FC<{
    suggestions: MattermostEmojiData[];
    selectedIndex: number;
    onSelect: (index: number) => void;
}> = ({ suggestions, selectedIndex, onSelect }) => {
    const listRef = useRef<HTMLDivElement>(null);

    // Scroll selected item into view
    useEffect(() => {
        const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (suggestions.length === 0) { return null; }

    return (
        <div
            ref={listRef}
            className="absolute bottom-full mb-1 left-0 right-0 max-h-32 overflow-y-auto rounded-md shadow-lg border
                bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))]
                border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))]
                z-50"
        >
            {suggestions.map((emoji, i) => (
                <button
                    key={emoji.name}
                    onMouseDown={(e) => {
                        e.preventDefault(); // Don't blur textarea
                        onSelect(i);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        i === selectedIndex
                            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                            : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                    }`}
                >
                    {(() => {
                        const unicode = emojiFromShortcode(emoji.name);
                        if (unicode) { return <span className="text-sm w-5 text-center">{unicode}</span>; }
                        if (emoji.imageUrl) { return <img src={emoji.imageUrl} alt={emoji.name} className="w-4 h-4 object-contain" />; }
                        return <span className="w-5 text-center text-fg/30">•</span>;
                    })()}
                    <span className="font-mono text-fg/60">:{emoji.name}:</span>
                </button>
            ))}
        </div>
    );
};
