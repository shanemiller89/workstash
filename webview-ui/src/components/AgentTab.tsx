import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useAIStore, type AISummary } from '../aiStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { MarkdownBody } from './MarkdownBody';
import { SummaryPane } from './SummaryPane';
import { ErrorBoundary } from './ErrorBoundary';
import {
    Wand2,
    Play,
    ClipboardList,
    Eye,
    Activity,
    FileText,
    Loader2,
    AlertCircle,
    RefreshCw,
    Trash2,
    Settings,
    Sparkles,
    Bot,
    Check,
    ChevronDown,
    ChevronUp,
    Archive,
    StickyNote,
    GitPullRequest,
    CircleDot,
    Kanban,
    MessageSquare,
    Pencil,
    RotateCcw,
} from 'lucide-react';

// ─── Templates ────────────────────────────────────────────────────

const AGENT_TEMPLATES = [
    {
        key: 'sprint',
        label: 'Sprint Overview',
        description: 'Full sprint status report across all data sources',
        Icon: ClipboardList,
    },
    {
        key: 'review',
        label: 'Code Review Status',
        description: 'PR review priorities, risk assessment, and suggested review order',
        Icon: Eye,
    },
    {
        key: 'activity',
        label: 'Team Activity',
        description: 'Recent activity snapshot, WIP indicators, and attention items',
        Icon: Activity,
    },
    {
        key: 'custom',
        label: 'Custom Analysis',
        description: 'Write your own prompt for deep analysis of workspace data',
        Icon: FileText,
    },
] as const;

// ─── Default system prompts (mirrors aiService AGENT_TEMPLATES) ───

const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
    sprint: `You are a senior engineering manager creating a sprint status report.
Analyze ALL the workspace data provided and produce a comprehensive sprint overview with these sections:
## Sprint Overview
- Overall velocity and health assessment
## Pull Requests
- PRs ready to merge, PRs needing review, stale PRs
## Issues & Projects
- Open issues by priority/label, project board status, blockers
## Code Activity
- Stash activity (work-in-progress indicators), branch patterns
## Team Communication
- Mattermost highlights, unread threads, action items from chat
## Recommendations
- Top 3 actions the team should take today

Use markdown formatting. Be specific — reference PR numbers, issue titles, etc.`,

    review: `You are a senior code reviewer analyzing the workspace for code review status.
Produce a detailed code review report:
## Review Dashboard
- PRs awaiting review (list each with age, author, size)
- PRs with unresolved comments
- PRs with requested changes
## Risk Assessment
- Large PRs (high additions/deletions) that need careful review
- PRs that have been open longest
- Draft PRs that might need help
## Suggested Review Order
- Prioritized list of which PRs to review first and why
## Related Issues
- Link PRs to their related issues where possible

Be specific with PR numbers and issue references.`,

    activity: `You are a team activity analyst reviewing the workspace.
Produce a team activity summary:
## Today's Snapshot
- What changed recently across all data sources
- New PRs, closed issues, updated projects
## Work In Progress
- Active stashes (uncommitted work)
- Open draft PRs
- Issues in progress
## Communication
- Mattermost channel activity, any mentions or urgent messages
- Notes recently updated
## Attention Needed
- Items that may be blocked or stale
- Anything that looks unusual or needs follow-up

Keep it scannable with bullet points.`,

    custom: `You are an expert development assistant with deep knowledge of software workflows.
Analyze the workspace data provided and respond to the user's custom prompt.
Be thorough, specific, and reference actual data items by name/number.
Use markdown formatting with clear sections.`,
};

// ─── Tab metadata for summaries dashboard ─────────────────────────

const SUMMARY_TABS = [
    { key: 'prs', label: 'Pull Requests', Icon: GitPullRequest },
    { key: 'issues', label: 'Issues', Icon: CircleDot },
    { key: 'projects', label: 'Projects', Icon: Kanban },
    { key: 'stashes', label: 'Stashes', Icon: Archive },
    { key: 'notes', label: 'Notes', Icon: StickyNote },
    { key: 'mattermost', label: 'Chat', Icon: MessageSquare },
] as const;

// ─── Agent Summary Card ──────────────────────────────────────────

const AgentSummaryCard: React.FC<{
    tabKey: string;
    label: string;
    Icon: React.FC<{ size?: number; className?: string }>;
    summary?: AISummary;
    onRefresh: (tabKey: string) => void;
    onOpen: (tabKey: string) => void;
}> = React.memo(({ tabKey, label, Icon, summary, onRefresh, onOpen }) => {
    const isLoading = summary?.isLoading ?? false;
    const hasContent = !!summary?.content;
    const hasError = !!summary?.error;

    return (
        <Card className="bg-[var(--vscode-editor-background)] border-border">
            <CardHeader className="pb-1 pt-2.5 px-3 flex-row items-center gap-2">
                <Icon size={13} className="text-fg/50 flex-shrink-0" />
                <CardTitle className="text-[11px] font-semibold flex-1">{label}</CardTitle>
                {hasContent && (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onOpen(tabKey)}
                        title={`View ${label} summary in pane`}
                    >
                        <Eye size={11} />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRefresh(tabKey)}
                    disabled={isLoading}
                    title={`Refresh ${label} summary`}
                >
                    {isLoading ? (
                        <Loader2 size={11} className="animate-spin" />
                    ) : (
                        <RefreshCw size={11} />
                    )}
                </Button>
            </CardHeader>
            <CardContent className="px-3 pb-2.5 pt-0">
                {isLoading && !hasContent ? (
                    <div className="flex items-center gap-2 py-2 text-fg/30 text-[10px]">
                        <Loader2 size={10} className="animate-spin" />
                        Generating summary…
                    </div>
                ) : hasError ? (
                    <div className="flex items-start gap-1.5 py-1 text-[10px] text-red-400">
                        <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
                        <span>{summary!.error}</span>
                    </div>
                ) : hasContent ? (
                    <MarkdownBody
                        content={summary!.content}
                        className="text-[10.5px] leading-relaxed"
                    />
                ) : (
                    <div className="text-[10px] text-fg/25 py-1">
                        Click refresh to generate
                    </div>
                )}
                {summary?.updatedAt && !isLoading && (
                    <div className="text-[8px] text-fg/20 mt-1.5">
                        Updated {formatTimeAgo(summary.updatedAt)}
                    </div>
                )}
            </CardContent>
        </Card>
    );
});
AgentSummaryCard.displayName = 'AgentSummaryCard';

// ─── Summaries Dashboard ──────────────────────────────────────────

const SummariesDashboard: React.FC = () => {
    const summaries = useAIStore((s) => s.summaries);
    const [expanded, setExpanded] = useState(false);

    const handleRefresh = useCallback((tabKey: string) => {
        useAIStore.getState().setSummaryLoading(tabKey);
        const prompt = useAIStore.getState().customPrompts[tabKey];
        postMessage('ai.summarize', { tabKey, ...(prompt ? { customPrompt: prompt } : {}) });
        // Open the summary pane so user can watch it stream in
        useAIStore.getState().setSummaryPaneTabKey(tabKey);
    }, []);

    const handleOpen = useCallback((tabKey: string) => {
        useAIStore.getState().setSummaryPaneTabKey(tabKey);
    }, []);

    const handleRefreshAll = useCallback(() => {
        for (const tab of SUMMARY_TABS) {
            useAIStore.getState().setSummaryLoading(tab.key);
            const prompt = useAIStore.getState().customPrompts[tab.key];
            postMessage('ai.summarize', { tabKey: tab.key, ...(prompt ? { customPrompt: prompt } : {}) });
        }
    }, []);

    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <button
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <Sparkles size={12} className="text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-fg/70">Tab Summaries</div>
                    <div className="text-[9px] text-fg/30">Generate or review summaries for all tabs</div>
                </div>
                {expanded ? (
                    <ChevronUp size={12} className="text-fg/30 flex-shrink-0" />
                ) : (
                    <ChevronDown size={12} className="text-fg/30 flex-shrink-0" />
                )}
            </button>
            {expanded && (
                <div className="border-t border-border p-3">
                    <div className="flex items-center justify-end mb-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-2 py-0.5 text-[9px] gap-1"
                            onClick={handleRefreshAll}
                        >
                            <RefreshCw size={9} />
                            Refresh All
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {SUMMARY_TABS.map((tab) => (
                            <AgentSummaryCard
                                key={tab.key}
                                tabKey={tab.key}
                                label={tab.label}
                                Icon={tab.Icon}
                                summary={summaries[tab.key]}
                                onRefresh={handleRefresh}
                                onOpen={handleOpen}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Model Picker (inline) ───────────────────────────────────────

const MODEL_PURPOSES = [
    { key: 'summary', label: 'Summaries', Icon: Sparkles },
    { key: 'chat', label: 'Chat', Icon: Bot },
    { key: 'agent', label: 'Agent', Icon: Wand2 },
] as const;

const ModelSettings: React.FC = () => {
    const availableModels = useAIStore((s) => s.availableModels);
    const modelAssignments = useAIStore((s) => s.modelAssignments);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (expanded && availableModels.length === 0) {
            postMessage('ai.listModels');
        }
    }, [expanded, availableModels.length]);

    const handleSetModel = useCallback((purpose: string, modelId: string) => {
        postMessage('ai.setModel', { purpose, modelId });
    }, []);

    // Summary line showing current assignments
    const summaryText = useMemo(() => {
        const parts = MODEL_PURPOSES.map(({ key, label }) => {
            const id = modelAssignments[key];
            if (!id) {
                return null;
            }
            const model = availableModels.find((m) => m.id === id);
            return model ? `${label}: ${model.name}` : null;
        }).filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : 'All using default (gpt-4o)';
    }, [modelAssignments, availableModels]);

    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <button
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <Settings size={12} className="text-fg/50 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-fg/70">Model Settings</div>
                    <div className="text-[9px] text-fg/30 truncate">{summaryText}</div>
                </div>
                {expanded ? (
                    <ChevronUp size={12} className="text-fg/30 flex-shrink-0" />
                ) : (
                    <ChevronDown size={12} className="text-fg/30 flex-shrink-0" />
                )}
            </button>
            {expanded && (
                <div className="border-t border-border px-3 py-2.5 flex flex-col gap-3">
                    {availableModels.length === 0 ? (
                        <div className="flex items-center gap-2 py-2 text-fg/30 text-[10px] justify-center">
                            <Loader2 size={10} className="animate-spin" />
                            Loading models…
                        </div>
                    ) : (
                        MODEL_PURPOSES.map(({ key, label, Icon }) => {
                            const currentId = modelAssignments[key] ?? '';
                            return (
                                <div key={key}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Icon size={11} className="text-fg/50" />
                                        <span className="text-[10px] font-semibold text-fg/50 uppercase tracking-wider">
                                            {label}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        <button
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-colors ${
                                                !currentId
                                                    ? 'bg-accent/15 text-fg border border-accent/30'
                                                    : 'text-fg/50 border border-border hover:border-fg/20'
                                            }`}
                                            onClick={() => handleSetModel(key, '')}
                                        >
                                            {!currentId && <Check size={8} className="text-accent" />}
                                            Auto
                                        </button>
                                        {availableModels.map((m) => (
                                            <button
                                                key={m.id}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-colors ${
                                                    currentId === m.id
                                                        ? 'bg-accent/15 text-fg border border-accent/30'
                                                        : 'text-fg/50 border border-border hover:border-fg/20'
                                                }`}
                                                onClick={() => handleSetModel(key, m.id)}
                                            >
                                                {currentId === m.id && <Check size={8} className="text-accent" />}
                                                {m.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Agent Tab ────────────────────────────────────────────────────

export const AgentTab: React.FC = () => {
    const aiProvider = useAIStore((s) => s.aiProvider);
    const agentTemplate = useAIStore((s) => s.agentTemplate);
    const agentPrompt = useAIStore((s) => s.agentPrompt);
    const agentSystemPrompts = useAIStore((s) => s.agentSystemPrompts);
    const agentResult = useAIStore((s) => s.agentResult);
    const agentIsStreaming = useAIStore((s) => s.agentIsStreaming);
    const agentError = useAIStore((s) => s.agentError);
    const agentPaneOpen = useAIStore((s) => s.agentPaneOpen);
    const agentPaneWidth = useAIStore((s) => s.agentPaneWidth);
    const setAgentTemplate = useAIStore((s) => s.setAgentTemplate);
    const setAgentPrompt = useAIStore((s) => s.setAgentPrompt);
    const setAgentSystemPrompt = useAIStore((s) => s.setAgentSystemPrompt);
    const clearAgent = useAIStore((s) => s.clearAgent);
    const setAgentPaneOpen = useAIStore((s) => s.setAgentPaneOpen);
    const setAgentPaneWidth = useAIStore((s) => s.setAgentPaneWidth);
    const summaryPaneTabKey = useAIStore((s) => s.summaryPaneTabKey);
    const resultRef = useRef<HTMLDivElement>(null);
    const [systemPromptOpen, setSystemPromptOpen] = useState(false);

    // Current system prompt (custom override or default)
    const currentSystemPrompt = agentSystemPrompts[agentTemplate] ?? '';
    const effectiveSystemPrompt = currentSystemPrompt.trim() || DEFAULT_SYSTEM_PROMPTS[agentTemplate] || '';
    const isSystemPromptCustomized = !!currentSystemPrompt.trim();

    // Auto-scroll as streaming content arrives
    useEffect(() => {
        if (resultRef.current && agentIsStreaming) {
            resultRef.current.scrollTop = resultRef.current.scrollHeight;
        }
    }, [agentResult, agentIsStreaming]);

    const handleRun = useCallback(() => {
        if (agentIsStreaming) {
            return;
        }
        const customSysPrompt = agentSystemPrompts[agentTemplate]?.trim() || '';
        postMessage('ai.agent', {
            mode: agentTemplate,
            body: agentPrompt,
            ...(customSysPrompt ? { systemPrompt: customSysPrompt } : {}),
        });
    }, [agentTemplate, agentPrompt, agentIsStreaming, agentSystemPrompts]);

    const handleResetSystemPrompt = useCallback(() => {
        setAgentSystemPrompt(agentTemplate, '');
    }, [agentTemplate, setAgentSystemPrompt]);

    const selectedMeta = useMemo(
        () => AGENT_TEMPLATES.find((t) => t.key === agentTemplate) ?? AGENT_TEMPLATES[0],
        [agentTemplate],
    );

    const hasResult = !!agentResult || agentIsStreaming;

    // Determine the label for the summary pane based on the open tab key
    const summaryPaneLabel = useMemo(() => {
        if (!summaryPaneTabKey) return '';
        return SUMMARY_TABS.find((t) => t.key === summaryPaneTabKey)?.label ?? summaryPaneTabKey;
    }, [summaryPaneTabKey]);

    // ─── Agent pane resize logic ──────────────────────────────
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

    const handlePaneResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizeRef.current = { startX: e.clientX, startW: agentPaneWidth };

        const handleResizeMove = (ev: MouseEvent) => {
            if (!resizeRef.current) return;
            const delta = resizeRef.current.startX - ev.clientX;
            const newWidth = Math.max(240, Math.min(800, resizeRef.current.startW + delta));
            setAgentPaneWidth(newWidth);
        };

        const handleResizeEnd = () => {
            resizeRef.current = null;
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    }, [agentPaneWidth, setAgentPaneWidth]);

    return (
        <div className="flex h-full">
        {/* ══════════ Setup view (always visible) ══════════ */}
        <div className="flex flex-col flex-1 min-w-0">
                <ScrollArea className="flex-1">
                    <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">
                        {/* Header */}
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                                <Wand2 size={16} className="text-accent" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <h2 className="text-[14px] font-semibold text-fg">AI Agent</h2>
                                    {aiProvider !== 'none' && (
                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal capitalize">
                                            {aiProvider}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-[11px] text-fg/40">
                                    Deep analysis of your workspace data using AI templates
                                </p>
                            </div>
                        </div>

                        <Separator />

                        {/* Template selector */}
                        <div>
                            <div className="text-[11px] font-semibold text-fg/60 uppercase tracking-wider mb-2">
                                Analysis Template
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {AGENT_TEMPLATES.map((t) => {
                                    const isSelected = agentTemplate === t.key;
                                    return (
                                        <button
                                            key={t.key}
                                            className={`flex items-start gap-2.5 p-3 rounded-lg text-left transition-colors ${
                                                isSelected
                                                    ? 'bg-accent/10 border-2 border-accent/40'
                                                    : 'bg-[var(--vscode-editor-background)] border-2 border-transparent hover:border-fg/10'
                                            }`}
                                            onClick={() => setAgentTemplate(t.key)}
                                        >
                                            <t.Icon
                                                size={16}
                                                className={`mt-0.5 flex-shrink-0 ${
                                                    isSelected ? 'text-accent' : 'text-fg/30'
                                                }`}
                                            />
                                            <div className="min-w-0">
                                                <div
                                                    className={`text-[12px] font-medium ${
                                                        isSelected ? 'text-fg' : 'text-fg/70'
                                                    }`}
                                                >
                                                    {t.label}
                                                </div>
                                                <div className="text-[10px] text-fg/30 mt-0.5 leading-snug">
                                                    {t.description}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Custom prompt */}
                        <div>
                            <div className="text-[11px] font-semibold text-fg/60 uppercase tracking-wider mb-2">
                                {agentTemplate === 'custom'
                                    ? 'Your Prompt'
                                    : 'Additional Instructions (optional)'}
                            </div>
                            <Textarea
                                value={agentPrompt}
                                onChange={(e) => setAgentPrompt(e.target.value)}
                                placeholder={
                                    agentTemplate === 'custom'
                                        ? 'Describe what you want to analyze about your workspace…'
                                        : 'Add extra focus areas or constraints…'
                                }
                                className="text-[12px] min-h-[80px] max-h-[200px] resize-y"
                                rows={4}
                            />
                        </div>

                        {/* System prompt editor (collapsible) */}
                        <div className="border border-border rounded-lg overflow-hidden">
                            <button
                                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                                onClick={() => setSystemPromptOpen(!systemPromptOpen)}
                            >
                                <Pencil size={12} className={isSystemPromptCustomized ? 'text-accent' : 'text-fg/50'} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium text-fg/70">
                                        System Prompt
                                        {isSystemPromptCustomized && (
                                            <span className="ml-1.5 text-[8px] text-accent font-normal">(customized)</span>
                                        )}
                                    </div>
                                    <div className="text-[9px] text-fg/30 truncate">
                                        Edit the AI system instructions for this template
                                    </div>
                                </div>
                                {systemPromptOpen ? (
                                    <ChevronUp size={12} className="text-fg/30 flex-shrink-0" />
                                ) : (
                                    <ChevronDown size={12} className="text-fg/30 flex-shrink-0" />
                                )}
                            </button>
                            {systemPromptOpen && (
                                <div className="border-t border-border px-3 py-2.5 flex flex-col gap-2">
                                    <Textarea
                                        value={currentSystemPrompt || DEFAULT_SYSTEM_PROMPTS[agentTemplate] || ''}
                                        onChange={(e) => setAgentSystemPrompt(agentTemplate, e.target.value)}
                                        placeholder="System prompt for AI analysis…"
                                        className="text-[11px] min-h-[120px] max-h-[300px] resize-y font-mono leading-relaxed"
                                        rows={8}
                                    />
                                    {isSystemPromptCustomized && (
                                        <div className="flex justify-end">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-auto px-2 py-0.5 text-[9px] gap-1 text-fg/50"
                                                onClick={handleResetSystemPrompt}
                                            >
                                                <RotateCcw size={9} />
                                                Reset to Default
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Run button */}
                        <Button
                            variant="default"
                            className="w-full h-auto py-2.5 text-[12px] gap-2"
                            onClick={handleRun}
                            disabled={
                                agentIsStreaming ||
                                (agentTemplate === 'custom' && !agentPrompt.trim())
                            }
                        >
                            {agentIsStreaming ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Analyzing…
                                </>
                            ) : (
                                <>
                                    <Play size={14} />
                                    {hasResult ? 'Re-run Analysis' : 'Run Analysis'}
                                </>
                            )}
                        </Button>

                        {/* Show results pane toggle when results exist but pane is closed */}
                        {hasResult && !agentPaneOpen && (
                            <Button
                                variant="outline"
                                className="w-full h-auto py-2 text-[11px] gap-2"
                                onClick={() => setAgentPaneOpen(true)}
                            >
                                <Eye size={13} />
                                Show Analysis Results
                            </Button>
                        )}

                        <Separator />

                        {/* Model settings (collapsible) */}
                        <ModelSettings />

                        {/* Summaries dashboard (collapsible) */}
                        <SummariesDashboard />
                    </div>
                </ScrollArea>
        </div>

        {/* ══════════ Agent results pane (right side, resizable) ══════════ */}
        {agentPaneOpen && hasResult && (
            <div
                className="flex-shrink-0 border-l border-border flex flex-col min-h-0 relative"
                style={{ width: agentPaneWidth }}
            >
                {/* Resize handle (left edge) */}
                <div
                    className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 hover:bg-accent/30 active:bg-accent/50 transition-colors"
                    onMouseDown={handlePaneResizeStart}
                />

                {/* Results header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[var(--vscode-editor-background)] flex-shrink-0">
                    <selectedMeta.Icon size={13} className="text-accent flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-fg/80 flex-1 truncate">
                        {selectedMeta.label}
                    </span>
                    {agentIsStreaming && (
                        <Badge variant="outline" className="text-[8px] gap-1 px-1.5 py-0.5">
                            <Loader2 size={8} className="animate-spin" />
                            Analyzing
                        </Badge>
                    )}
                    {!agentIsStreaming && (
                        <div className="flex items-center gap-0.5">
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={handleRun}
                                title="Re-run analysis"
                            >
                                <RefreshCw size={11} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={clearAgent}
                                title="Clear results"
                            >
                                <Trash2 size={11} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setAgentPaneOpen(false)}
                                title="Close pane"
                            >
                                ✕
                            </Button>
                        </div>
                    )}
                </div>

                {/* Results content */}
                {agentError ? (
                    <div className="flex items-start gap-2 p-3 text-[11px] text-red-400">
                        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{agentError}</span>
                    </div>
                ) : (
                    <ScrollArea className="flex-1" ref={resultRef}>
                        <div className="px-4 py-3">
                            <MarkdownBody
                                content={agentResult || '…'}
                                className="text-[11.5px] leading-relaxed"
                            />
                            {agentIsStreaming && agentResult && (
                                <span className="inline-block w-1.5 h-3.5 bg-accent/60 ml-0.5 animate-pulse" />
                            )}
                        </div>
                    </ScrollArea>
                )}
            </div>
        )}

        {/* Right summary pane (opens when a summary card is clicked) */}
        {summaryPaneTabKey && !agentPaneOpen && (
            <div className="w-[280px] flex-shrink-0 overflow-hidden">
                <ErrorBoundary label="AI Summary">
                    <SummaryPane tabKey={summaryPaneTabKey} label={summaryPaneLabel} />
                </ErrorBoundary>
            </div>
        )}
        </div>
    );
};

// ─── Helper ───────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) {
        return 'just now';
    }
    if (mins < 60) {
        return `${mins}m ago`;
    }
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
        return `${hrs}h ago`;
    }
    return `${Math.floor(hrs / 24)}d ago`;
}
