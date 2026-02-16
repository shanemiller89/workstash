import { useState, useCallback, useEffect, useRef } from 'react';

// ─── useRovingTabIndex ──────────────────────────────────────────
// Reusable hook for keyboard-navigable list views.
// Supports: ArrowUp/Down, Home/End, Enter/Space, Escape.
//
// Usage:
//   const { focusedIndex, listRef, getItemProps, handleSearchKeyDown } =
//     useRovingTabIndex({ itemCount, onSelect, searchRef, onEscape });
//
//   <div ref={listRef} role="listbox" {...containerProps}>
//     {items.map((item, i) => (
//       <div {...getItemProps(i)} onClick={() => onSelect(i)}>…</div>
//     ))}
//   </div>

export interface UseRovingTabIndexOptions {
    /** Total number of items in the list. */
    itemCount: number;
    /** Called when the user presses Enter/Space on a focused item. */
    onSelect?: (index: number) => void;
    /** Optional ref to a search input — ArrowUp from index 0 returns focus there. */
    searchRef?: React.RefObject<HTMLInputElement | null>;
    /** Called when Escape is pressed within the list. */
    onEscape?: () => void;
    /** Attribute name used to query focusable items inside the list container. Default: `'data-roving-item'`. */
    itemSelector?: string;
}

export interface UseRovingTabIndexReturn {
    /** Currently focused item index (-1 = no focus). */
    focusedIndex: number;
    /** Ref to attach to the scrollable list container. */
    listRef: React.RefObject<HTMLDivElement | null>;
    /** Props to spread on the list container (onKeyDown, role, aria-label). */
    containerProps: {
        onKeyDown: (e: React.KeyboardEvent) => void;
        role: string;
    };
    /** Returns per-item props (tabIndex, data-roving-item, aria-selected). */
    getItemProps: (index: number) => {
        tabIndex: number;
        'data-roving-item': '';
        'aria-selected': boolean;
    };
    /** Attach to a search input's onKeyDown — ArrowDown enters the list. */
    handleSearchKeyDown: (e: React.KeyboardEvent) => void;
    /** Imperatively set focus index (e.g. to reset). */
    setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useRovingTabIndex({
    itemCount,
    onSelect,
    searchRef,
    onEscape,
    itemSelector = 'data-roving-item',
}: UseRovingTabIndexOptions): UseRovingTabIndexReturn {
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);

    // ── List-level keyboard handler ──
    const handleListKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (itemCount === 0) {return;}

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex((prev) => {
                        if (prev <= 0) {
                            searchRef?.current?.focus();
                            return -1;
                        }
                        return prev - 1;
                    });
                    break;
                case 'Home':
                    e.preventDefault();
                    setFocusedIndex(0);
                    break;
                case 'End':
                    e.preventDefault();
                    setFocusedIndex(itemCount - 1);
                    break;
                case 'Enter':
                case ' ':
                    if (focusedIndex >= 0) {
                        e.preventDefault();
                        onSelect?.(focusedIndex);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (onEscape) {
                        onEscape();
                    } else {
                        searchRef?.current?.focus();
                        setFocusedIndex(-1);
                    }
                    break;
            }
        },
        [itemCount, focusedIndex, onSelect, searchRef, onEscape],
    );

    // ── Move DOM focus when focusedIndex changes ──
    useEffect(() => {
        if (focusedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll<HTMLElement>(`[${itemSelector}]`);
            items[focusedIndex]?.focus();
        }
    }, [focusedIndex, itemSelector]);

    // ── Reset when item count changes ──
    useEffect(() => {
        setFocusedIndex(-1);
    }, [itemCount]);

    // ── Search input helper: ArrowDown enters the list ──
    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown' && itemCount > 0) {
                e.preventDefault();
                setFocusedIndex(0);
            }
        },
        [itemCount],
    );

    // ── Per-item props factory ──
    const getItemProps = useCallback(
        (index: number) => ({
            tabIndex: focusedIndex === index ? 0 : -1,
            'data-roving-item': '' as const,
            'aria-selected': focusedIndex === index,
        }),
        [focusedIndex],
    );

    const containerProps = {
        onKeyDown: handleListKeyDown,
        role: 'listbox' as const,
    };

    return {
        focusedIndex,
        listRef,
        containerProps,
        getItemProps,
        handleSearchKeyDown,
        setFocusedIndex,
    };
}
