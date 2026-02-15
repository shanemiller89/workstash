import React, { useCallback, useMemo } from 'react';
import { useWikiStore, type WikiPageSummaryData } from '../wikiStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { MarkdownBody } from './MarkdownBody';
import { ResizableLayout } from './ResizableLayout';
import { TabWithSummary } from './TabWithSummary';
import {
    BookOpen,
    Search,
    RefreshCw,
    ExternalLink,
    FileText,
    AlertCircle,
    ChevronLeft,
} from 'lucide-react';

// ─── Wiki Page List ───────────────────────────────────────────────

const WikiPageItem: React.FC<{
    page: WikiPageSummaryData;
    isSelected: boolean;
    onSelect: (filename: string) => void;
}> = React.memo(({ page, isSelected, onSelect }) => {
    const handleClick = useCallback(() => {
        onSelect(page.filename);
    }, [page.filename, onSelect]);

    return (
        <button
            className={`w-full text-left px-3 py-2 border-b border-border/50 cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-accent/15 border-l-2 border-l-accent'
                    : 'hover:bg-fg/5'
            }`}
            onClick={handleClick}
        >
            <div className="flex items-center gap-2">
                <FileText size={14} className={`flex-shrink-0 ${
                    page.title === 'Home' ? 'text-accent' : 'text-fg/40'
                }`} />
                <span className={`text-[12px] font-medium truncate ${
                    isSelected ? 'text-fg' : 'text-fg/80'
                }`}>
                    {page.title}
                </span>
            </div>
        </button>
    );
});
WikiPageItem.displayName = 'WikiPageItem';

const WikiList: React.FC = () => {
    const pages = useWikiStore((s) => s.pages);
    const isLoading = useWikiStore((s) => s.isLoading);
    const error = useWikiStore((s) => s.error);
    const noWiki = useWikiStore((s) => s.noWiki);
    const searchQuery = useWikiStore((s) => s.searchQuery);
    const setSearchQuery = useWikiStore((s) => s.setSearchQuery);
    const selectedFilename = useWikiStore((s) => s.selectedFilename);
    const selectPage = useWikiStore((s) => s.selectPage);
    const authRequired = useWikiStore((s) => s.authRequired);
    const filteredPages = useWikiStore((s) => s.filteredPages);

    const filtered = useMemo(() => filteredPages(), [filteredPages, pages, searchQuery]);

    const handleRefresh = useCallback(() => {
        postMessage('wiki.refresh');
    }, []);

    const handleSelectPage = useCallback(
        (filename: string) => {
            selectPage(filename);
            postMessage('wiki.getPage', { filename });
        },
        [selectPage],
    );

    const handleOpenInBrowser = useCallback(() => {
        postMessage('wiki.openInBrowser');
    }, []);

    // Not authenticated
    if (authRequired) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <BookOpen size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Sign in to GitHub to view wiki pages.
                </p>
                <Button size="sm" onClick={() => postMessage('wiki.signIn')}>
                    Sign In
                </Button>
            </div>
        );
    }

    // No wiki found
    if (noWiki) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <BookOpen size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    This repository doesn&apos;t have a wiki yet.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenInBrowser}
                    className="gap-1.5"
                >
                    <ExternalLink size={12} />
                    Create Wiki on GitHub
                </Button>
            </div>
        );
    }

    // Error
    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertCircle size={32} className="text-destructive/50" />
                <p className="text-fg/60 text-[12px]">{error}</p>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw size={12} className="mr-1" />
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-bg text-fg text-[13px]">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
                <BookOpen size={14} className="text-fg/60" />
                <span className="text-[12px] font-semibold text-fg/80 flex-1">Wiki</span>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleOpenInBrowser}
                    title="Open wiki on GitHub"
                >
                    <ExternalLink size={12} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRefresh}
                    title="Refresh wiki"
                >
                    <RefreshCw size={12} />
                </Button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-border flex-shrink-0">
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/40" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search pages…"
                        className="h-7 pl-7 text-[11px]"
                    />
                </div>
            </div>

            {/* Page List */}
            <ScrollArea className="flex-1 min-h-0">
                {isLoading ? (
                    <div className="p-3 space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-8 w-full" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                        <FileText size={24} className="text-fg/20" />
                        <p className="text-fg/40 text-[11px]">
                            {searchQuery ? 'No matching pages' : 'No wiki pages found'}
                        </p>
                    </div>
                ) : (
                    filtered.map((page) => (
                        <WikiPageItem
                            key={page.filename}
                            page={page}
                            isSelected={page.filename === selectedFilename}
                            onSelect={handleSelectPage}
                        />
                    ))
                )}
            </ScrollArea>
        </div>
    );
};

// ─── Wiki Page Detail ─────────────────────────────────────────────

const WikiPageDetail: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const selectedPage = useWikiStore((s) => s.selectedPage);
    const isPageLoading = useWikiStore((s) => s.isPageLoading);
    const selectedFilename = useWikiStore((s) => s.selectedFilename);

    const handleOpenInBrowser = useCallback(() => {
        if (selectedFilename) {
            postMessage('wiki.openPageInBrowser', { filename: selectedFilename });
        }
    }, [selectedFilename]);

    if (isPageLoading) {
        return (
            <div className="h-full flex flex-col bg-bg text-fg">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="p-4 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            </div>
        );
    }

    if (!selectedPage) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
                <BookOpen size={32} className="text-fg/20" />
                <p className="text-fg/40 text-[12px]">Select a page to view</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-bg text-fg text-[13px]">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
                <FileText size={14} className="text-accent" />
                <span className="text-[12px] font-semibold flex-1 truncate">
                    {selectedPage.title}
                </span>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleOpenInBrowser}
                    title="Open on GitHub"
                >
                    <ExternalLink size={12} />
                </Button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 min-h-0">
                <div className="p-4">
                    <MarkdownBody content={selectedPage.content} />
                </div>
            </ScrollArea>
        </div>
    );
};

// ─── Wiki Tab ─────────────────────────────────────────────────────

export const WikiTab: React.FC = () => {
    const selectedFilename = useWikiStore((s) => s.selectedFilename);
    const clearSelection = useWikiStore((s) => s.clearSelection);

    const handleCloseDetail = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const hasSelection = selectedFilename !== null;

    return (
        <TabWithSummary tabKey="wiki">
            <ResizableLayout
                storageKey="wiki"
                hasSelection={hasSelection}
                backLabel="Back to wiki"
                onBack={handleCloseDetail}
                listContent={<WikiList />}
                detailContent={<WikiPageDetail onClose={handleCloseDetail} />}
            />
        </TabWithSummary>
    );
};
