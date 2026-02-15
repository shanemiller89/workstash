import React, { useCallback, useState } from 'react';
import { useAIStore, type AISummary } from '../aiStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { MarkdownBody } from './MarkdownBody';
import {
    Sparkles,
    RefreshCw,
    Loader2,
    AlertCircle,
    Pencil,
    X,
    Check,
    RotateCcw,
} from 'lucide-react';

// ─── Default system prompt (mirrors aiService.ts) ─────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a concise development assistant embedded in a VS Code extension called Superprompt Forge. 
Your job is to summarize workspace data into a brief, actionable card (3-5 bullet points max).
Use short, scannable phrases — not full sentences. Use emoji sparingly for visual cues.
Focus on what's actionable: what needs attention, what changed recently, key stats.
Do NOT use markdown headers or code blocks. Keep it under 150 words.`;

// ─── Helper ───────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────

interface SummaryPaneProps {
    tabKey: string;
    label: string;
}

export const SummaryPane: React.FC<SummaryPaneProps> = React.memo(({ tabKey, label }) => {
    const summary = useAIStore((s) => s.summaries[tabKey]) as AISummary | undefined;
    const customPrompt = useAIStore((s) => s.customPrompts[tabKey]) as string | undefined;
    const setSummaryPaneTabKey = useAIStore((s) => s.setSummaryPaneTabKey);
    const [editingPrompt, setEditingPrompt] = useState(false);
    const [promptDraft, setPromptDraft] = useState('');

    const isLoading = summary?.isLoading ?? false;
    const hasContent = !!summary?.content;
    const hasError = !!summary?.error;
    const hasCustomPrompt = !!customPrompt;

    // Auto-generate on mount if no content yet
    React.useEffect(() => {
        if (!summary?.content && !summary?.isLoading) {
            useAIStore.getState().setSummaryLoading(tabKey);
            const prompt = useAIStore.getState().customPrompts[tabKey];
            postMessage('ai.summarize', { tabKey, ...(prompt ? { customPrompt: prompt } : {}) });
        }
    }, [tabKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRefresh = useCallback(() => {
        useAIStore.getState().setSummaryLoading(tabKey);
        const prompt = useAIStore.getState().customPrompts[tabKey];
        postMessage('ai.summarize', { tabKey, ...(prompt ? { customPrompt: prompt } : {}) });
    }, [tabKey]);

    const handleClose = useCallback(() => {
        setSummaryPaneTabKey(null);
    }, [setSummaryPaneTabKey]);

    const handleEditPrompt = useCallback(() => {
        setPromptDraft(customPrompt ?? DEFAULT_SYSTEM_PROMPT);
        setEditingPrompt(true);
    }, [customPrompt]);

    const handleSavePrompt = useCallback(() => {
        const trimmed = promptDraft.trim();
        if (!trimmed || trimmed === DEFAULT_SYSTEM_PROMPT.trim()) {
            useAIStore.getState().setCustomPrompt(tabKey, '');
        } else {
            useAIStore.getState().setCustomPrompt(tabKey, trimmed);
        }
        setEditingPrompt(false);
    }, [tabKey, promptDraft]);

    const handleResetPrompt = useCallback(() => {
        setPromptDraft(DEFAULT_SYSTEM_PROMPT);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setEditingPrompt(false);
    }, []);

    return (
        <div className="h-full flex flex-col bg-[var(--vscode-editor-background)] border-l border-border">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
                <Sparkles size={12} className="text-accent flex-shrink-0" />
                <span className="text-[11px] font-semibold text-fg/70 flex-1 truncate">
                    {label} Summary
                    {hasCustomPrompt && (
                        <span className="ml-1.5 text-accent/50 text-[9px] font-normal">• custom</span>
                    )}
                </span>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleEditPrompt}
                        title="Edit summary prompt"
                    >
                        <Pencil size={11} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        title={`Refresh ${label} summary`}
                    >
                        {isLoading ? (
                            <Loader2 size={11} className="animate-spin" />
                        ) : (
                            <RefreshCw size={11} />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleClose}
                        title="Close summary pane"
                    >
                        <X size={11} />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {editingPrompt ? (
                /* ── Prompt editor ── */
                <div className="flex flex-col flex-1 min-h-0 p-3 gap-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-fg/60 uppercase tracking-wider">
                            System Prompt
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={handleResetPrompt}
                                title="Reset to default"
                            >
                                <RotateCcw size={10} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={handleCancelEdit}
                                title="Cancel"
                            >
                                <X size={10} />
                            </Button>
                            <Button
                                variant="default"
                                size="icon-xs"
                                onClick={handleSavePrompt}
                                title="Save prompt"
                            >
                                <Check size={10} />
                            </Button>
                        </div>
                    </div>
                    <Textarea
                        value={promptDraft}
                        onChange={(e) => setPromptDraft(e.target.value)}
                        className="text-[11px] flex-1 resize-none leading-relaxed"
                    />
                    <p className="text-[9px] text-fg/25">
                        This prompt instructs the AI how to generate summaries for this tab.
                    </p>
                </div>
            ) : (
                /* ── Summary content ── */
                <ScrollArea className="flex-1">
                    <div className="p-3">
                        {isLoading && !hasContent ? (
                            <div className="flex items-center gap-2 py-4 text-fg/30 text-[11px] justify-center">
                                <Loader2 size={12} className="animate-spin" />
                                Generating summary…
                            </div>
                        ) : hasError ? (
                            <div className="flex items-start gap-1.5 py-2 text-[11px] text-red-400">
                                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                                <span>{summary!.error}</span>
                            </div>
                        ) : hasContent ? (
                            <MarkdownBody
                                content={summary!.content}
                                className="text-[11.5px] leading-relaxed"
                            />
                        ) : (
                            <div className="text-[11px] text-fg/25 py-4 text-center">
                                Click refresh to generate a summary
                            </div>
                        )}

                        {summary?.updatedAt && !isLoading && (
                            <div className="text-[9px] text-fg/20 mt-3 pt-2 border-t border-border">
                                Updated {formatTimeAgo(summary.updatedAt)}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
});
SummaryPane.displayName = 'SummaryPane';
