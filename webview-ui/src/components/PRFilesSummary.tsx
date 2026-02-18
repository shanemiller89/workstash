import React, { useCallback, useState } from 'react';
import { usePRStore } from '../prStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { MarkdownBody } from './MarkdownBody';
import { ScrollArea } from './ui/scroll-area';
import { CopyMarkdownButton } from './CopyMarkdownButton';
import {
    Sparkles,
    Loader2,
    RefreshCw,
    XCircle,
    X,
    PanelRightOpen,
    Pencil,
    Check,
    RotateCcw,
} from 'lucide-react';

// ─── Default system prompt (mirrors prHandlers.ts) ────────────────

const DEFAULT_FILE_REVIEW_PROMPT = `You are a senior software engineer reviewing a pull request.

## Inputs You Will Receive
1. A PR diff (changed files with hunks).
2. "Generated file summaries" produced earlier in this workflow — treat these as **provisional and potentially incomplete**.

## Goal
Help the author and reviewers quickly grok what changed, why, and what could go wrong — by building ground truth from the diff, cross-referencing it against the generated summaries, then regenerating a corrected final review.

## Hard Rules
- Do **not** reproduce diff hunks.
- Be concise but specific: reference actual function names, variables, types, routes, components, SQL tables, selectors, etc.
- When something is unclear from the diff context, say so explicitly and ask a concrete follow-up question.
- Every "What changed" claim must be directly grounded in the diff.
- Every "Why" claim must be explicitly labeled as inference.
- Prefer concrete language: "changes X from A → B" over "updates X" or "refactored stuff."

---

# Phase 1 — Build Per-File Ground Truth

For EACH changed file:

## \`path/to/file.ext\`
**Change type:** \`Behavior change | Refactor / restructuring | Bug fix | Test-only | Chore / tooling | Unclear from diff\`

- **What changed:** 1–4 bullets describing concrete modifications (add/remove/rename/refactor/logic change), referencing real identifiers from the diff.
- **Why (inferred):** 1–2 bullets on the likely purpose, inferred strictly from diff context. Label these as inference.
- **Behavioral impact:** \`None | Low | Medium | High\` — with a 1-line justification.
- **Risk flags:** Bullets covering potential issues such as correctness/edge cases, backward compatibility, breaking API/contract changes, error handling gaps, null/undefined handling, security/auth/data exposure, performance (N+1, extra renders, expensive loops), type or schema drift, and migration mismatches. Write \`None noted\` if none apply.
- **Suggested checks:** 2–5 bullets for how to validate (tests to run/add, scenarios to verify, data or config to inspect, logs/monitoring to check).

After all files:

## Overall Summary (Phase 1)
2–3 sentences describing what the PR accomplishes at a high level — feature, bugfix, or refactor — and where risk concentrates.

---

# Phase 2 — Cross-Reference Generated Summaries (Self-Audit)

Compare your Phase 1 per-file ground truth against each file's generated summary.

## Summary Cross-Check

For each file:
- **Generated summary claims:** _(1-sentence paraphrase — do not quote verbatim)_
- **Diff actually shows:** _(your Phase 1 ground truth, 1 sentence)_
- **Mismatch?** \`Yes / No\`
  - If **Yes**, classify:
    - \`Missing change\` — summary omitted something important
    - \`Incorrect claim\` — summary stated something unsupported by the diff
    - \`Understated impact\` / \`Overstated impact\`
    - \`Wrong inferred intent\`
  - **Correction:** 1–2 bullets with the corrected understanding.

Also include:
- **Potentially overlooked areas:** bullets for files/concerns that _should_ have been touched but weren't (e.g., tests, types, migrations, docs, feature flags, call sites for changed exports).
- **Risk hotspots:** top 1–5 bullets across the whole PR — the most likely failure modes.

---

# Phase 3 — Regenerated Final Review

Rewrite the complete review incorporating all corrections and additions from Phase 2. The reader should be able to rely on this section alone.

## Final Review (Regenerated)

Start with a **2–3 sentence Overall Summary** — what the PR accomplishes and where risk concentrates.

Then, for each file (same format as Phase 1, tightened to the most important points):

## \`path/to/file.ext\`
**Change type:** \`...\`
- **What changed:** ...
- **Why (inferred):** ...
- **Behavioral impact:** ...
- **Risk flags:** ...
- **Suggested checks:** ...

Close with:

### Top Risks (ranked, highest severity first)
3–7 bullets. If a public API changed (exports, function signatures, route contracts, schema/types), call it out here and list impacted call sites/files if visible in the diff.

### Required Follow-Ups
Bullets for must-fix items before merge. Write \`None\` if not applicable.

### Nice-to-Haves
Bullets for optional improvements or deferred cleanup.`;

// ─── Inline trigger bar (goes inside Files Changed tab) ──────────

/**
 * PRFilesSummaryTrigger — a thin bar at the top of the Files Changed tab.
 * Shows a "Summarize" button, loading spinner, error, or "View summary" toggle.
 */
export const PRFilesSummary: React.FC<{ prNumber: number }> = ({ prNumber }) => {
    const filesSummary = usePRStore((s) => s.filesSummary);
    const isLoading = usePRStore((s) => s.isFilesSummaryLoading);
    const error = usePRStore((s) => s.filesSummaryError);
    const prFiles = usePRStore((s) => s.prFiles);
    const paneOpen = usePRStore((s) => s.filesSummaryPaneOpen);
    const setPaneOpen = usePRStore((s) => s.setFilesSummaryPaneOpen);

    const handleGenerate = useCallback(() => {
        const customPrompt = usePRStore.getState().fileReviewSystemPrompt;
        postMessage('prs.generateFilesSummary', {
            prNumber,
            ...(customPrompt ? { customSystemPrompt: customPrompt } : {}),
        });
    }, [prNumber]);

    if (prFiles.length === 0) { return null; }

    // Initial — no summary yet
    if (!filesSummary && !isLoading && !error) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[var(--vscode-editor-background)]">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px] text-fg/60 hover:text-fg"
                    onClick={handleGenerate}
                >
                    <Sparkles size={12} />
                    Summarize file changes with AI
                </Button>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-fg/40 border-fg/20">
                    {prFiles.length} file{prFiles.length !== 1 ? 's' : ''}
                </Badge>
            </div>
        );
    }

    // Loading
    if (isLoading) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[var(--vscode-editor-background)]">
                <Loader2 size={13} className="animate-spin text-fg/40" />
                <span className="text-[11px] text-fg/50">Analyzing file changes…</span>
            </div>
        );
    }

    // Error
    if (error) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[var(--vscode-editor-background)]">
                <XCircle size={12} className="text-red-400 shrink-0" />
                <span className="text-[11px] text-red-400 flex-1 truncate">{error}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[10px] text-fg/50 hover:text-fg"
                    onClick={handleGenerate}
                >
                    <RefreshCw size={10} />
                    Retry
                </Button>
            </div>
        );
    }

    // Summary available — show toggle bar
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-[var(--vscode-editor-background)]">
            <Sparkles size={12} className="text-yellow-400 shrink-0" />
            <span className="text-[11px] font-medium text-fg/70 flex-1">AI File Change Summary</span>
            <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[10px]"
                onClick={() => setPaneOpen(!paneOpen)}
            >
                <PanelRightOpen size={11} />
                {paneOpen ? 'Hide' : 'Show'}
            </Button>
        </div>
    );
};

// ─── Right pane (rendered in PRDetail alongside main content) ────

interface PRFilesSummaryPaneProps {
    prNumber: number;
    width: number;
    onResizeStart: (e: React.MouseEvent) => void;
}

/**
 * PRFilesSummaryPane — resizable right pane showing the full AI file change summary.
 */
export const PRFilesSummaryPane: React.FC<PRFilesSummaryPaneProps> = ({
    prNumber,
    width,
    onResizeStart,
}) => {
    const filesSummary = usePRStore((s) => s.filesSummary);
    const isLoading = usePRStore((s) => s.isFilesSummaryLoading);
    const setPaneOpen = usePRStore((s) => s.setFilesSummaryPaneOpen);
    const fileReviewSystemPrompt = usePRStore((s) => s.fileReviewSystemPrompt);
    const setFileReviewSystemPrompt = usePRStore((s) => s.setFileReviewSystemPrompt);

    const [editingPrompt, setEditingPrompt] = useState(false);
    const [promptDraft, setPromptDraft] = useState('');

    const hasCustomPrompt = !!fileReviewSystemPrompt;

    const handleRegenerate = useCallback(() => {
        const customPrompt = usePRStore.getState().fileReviewSystemPrompt;
        postMessage('prs.generateFilesSummary', {
            prNumber,
            ...(customPrompt ? { customSystemPrompt: customPrompt } : {}),
        });
    }, [prNumber]);

    const handleEditPrompt = useCallback(() => {
        setPromptDraft(fileReviewSystemPrompt || DEFAULT_FILE_REVIEW_PROMPT);
        setEditingPrompt(true);
    }, [fileReviewSystemPrompt]);

    const handleSavePrompt = useCallback(() => {
        const trimmed = promptDraft.trim();
        if (!trimmed || trimmed === DEFAULT_FILE_REVIEW_PROMPT.trim()) {
            setFileReviewSystemPrompt('');
        } else {
            setFileReviewSystemPrompt(trimmed);
        }
        setEditingPrompt(false);
    }, [promptDraft, setFileReviewSystemPrompt]);

    const handleResetPrompt = useCallback(() => {
        setPromptDraft(DEFAULT_FILE_REVIEW_PROMPT);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setEditingPrompt(false);
    }, []);

    return (
        <div
            className="shrink-0 border-l border-border flex flex-col min-h-0 relative"
            style={{ width }}
        >
            {/* Resize handle (left edge) */}
            <div
                className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 hover:bg-accent/30 active:bg-accent/50 transition-colors"
                onMouseDown={onResizeStart}
            />

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[var(--vscode-editor-background)] shrink-0">
                <Sparkles size={12} className="text-yellow-400 shrink-0" />
                <span className="text-[11px] font-semibold text-fg/70 flex-1 truncate">
                    File Change Summary
                    {hasCustomPrompt && (
                        <span className="ml-1.5 text-accent/50 text-[9px] font-normal">• custom</span>
                    )}
                </span>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleEditPrompt}
                        title="Edit system prompt"
                    >
                        <Pencil size={11} />
                    </Button>
                    <CopyMarkdownButton content={filesSummary ?? ''} iconSize={11} />
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleRegenerate}
                        disabled={isLoading}
                        title="Regenerate summary"
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
                        onClick={() => setPaneOpen(false)}
                        title="Close pane"
                    >
                        <X size={11} />
                    </Button>
                </div>
            </div>

            {/* Content */}
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
                        This prompt instructs the AI how to summarize file changes in this PR.
                    </p>
                </div>
            ) : isLoading ? (
                <div className="flex-1 flex items-center justify-center text-fg/40 text-[11px]">
                    <Loader2 size={14} className="animate-spin mr-2" />
                    Analyzing file changes…
                </div>
            ) : filesSummary ? (
                <ScrollArea className="flex-1">
                    <div className="px-4 py-3">
                        <MarkdownBody
                            content={filesSummary}
                            className="text-[11.5px] leading-relaxed"
                        />
                    </div>
                </ScrollArea>
            ) : (
                <div className="flex-1 flex items-center justify-center text-fg/30 text-[11px]">
                    No summary generated yet
                </div>
            )}
        </div>
    );
};
