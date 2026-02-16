import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePRStore } from '../prStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
    ArrowLeft,
    GitBranch,
    GitPullRequest,
    Sparkles,
    Loader2,
    AlertCircle,
    ChevronDown,
    Settings2,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

interface CreatePRFormProps {
    onBack: () => void;
}

export const CreatePRForm: React.FC<CreatePRFormProps> = ({ onBack }) => {
    const branches = usePRStore((s) => s.branches);
    const currentBranch = usePRStore((s) => s.currentBranch);
    const isCreatingPR = usePRStore((s) => s.isCreatingPR);
    const createError = usePRStore((s) => s.createError);
    const isGeneratingSummary = usePRStore((s) => s.isGeneratingSummary);
    const generatedSummary = usePRStore((s) => s.generatedSummary);
    const summaryError = usePRStore((s) => s.summaryError);
    const prSummarySystemPrompt = usePRStore((s) => s.prSummarySystemPrompt);
    const setPRSummarySystemPrompt = usePRStore((s) => s.setPRSummarySystemPrompt);

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [headBranch, setHeadBranch] = useState(currentBranch ?? '');
    const [baseBranch, setBaseBranch] = useState('');
    const [isDraft, setIsDraft] = useState(false);
    const [showPromptEditor, setShowPromptEditor] = useState(false);
    const [headOpen, setHeadOpen] = useState(false);
    const [baseOpen, setBaseOpen] = useState(false);
    const [headFilter, setHeadFilter] = useState('');
    const [baseFilter, setBaseFilter] = useState('');
    const headRef = useRef<HTMLDivElement>(null);
    const baseRef = useRef<HTMLDivElement>(null);

    // Request branches on mount
    useEffect(() => {
        postMessage('prs.getBranches');
    }, []);

    // Set head to current branch once loaded
    useEffect(() => {
        if (currentBranch && !headBranch) {
            setHeadBranch(currentBranch);
        }
    }, [currentBranch, headBranch]);

    // Set default base branch (main or master, excluding current)
    useEffect(() => {
        if (branches.length > 0 && !baseBranch) {
            const defaultBase = branches.find(
                (b) => (b === 'main' || b === 'master') && b !== headBranch,
            );
            setBaseBranch(defaultBase ?? branches.find((b) => b !== headBranch) ?? '');
        }
    }, [branches, baseBranch, headBranch]);

    // Apply generated summary
    useEffect(() => {
        if (generatedSummary) {
            setBody(generatedSummary);
        }
    }, [generatedSummary]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (headRef.current && !headRef.current.contains(e.target as Node)) {
                setHeadOpen(false);
            }
            if (baseRef.current && !baseRef.current.contains(e.target as Node)) {
                setBaseOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleGenerateSummary = useCallback(() => {
        if (!baseBranch) return;
        postMessage('prs.generateSummary', {
            baseBranch,
            systemPrompt: prSummarySystemPrompt || undefined,
        });
    }, [baseBranch, prSummarySystemPrompt]);

    const handleCreate = useCallback(() => {
        if (!title.trim() || !headBranch || !baseBranch) return;
        postMessage('prs.createPR', {
            title: title.trim(),
            body: body.trim(),
            headBranch,
            baseBranch,
            draft: isDraft,
        });
    }, [title, body, headBranch, baseBranch, isDraft]);

    const filteredHeadBranches = branches.filter(
        (b) =>
            b !== baseBranch &&
            (headFilter === '' || b.toLowerCase().includes(headFilter.toLowerCase())),
    );

    const filteredBaseBranches = branches.filter(
        (b) =>
            b !== headBranch &&
            (baseFilter === '' || b.toLowerCase().includes(baseFilter.toLowerCase())),
    );

    const canCreate = title.trim() && headBranch && baseBranch && headBranch !== baseBranch;

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border p-3">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={onBack}
                        title="Back to PR list"
                    >
                        <ArrowLeft size={14} />
                    </Button>
                    <GitPullRequest size={16} className="text-green-400" />
                    <span className="text-[13px] font-medium">Create Pull Request</span>
                </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                {/* Branch selectors */}
                <div className="flex flex-col gap-3">
                    {/* Head branch */}
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-fg/50">
                            <GitBranch size={10} className="inline mr-1" />
                            Source branch (head)
                        </Label>
                        <div className="relative" ref={headRef}>
                            <Button
                                variant="outline"
                                className="w-full justify-between text-[11px] h-8"
                                onClick={() => {
                                    setHeadOpen(!headOpen);
                                    setHeadFilter('');
                                }}
                            >
                                <span className="truncate">
                                    {headBranch || 'Select branch…'}
                                </span>
                                <ChevronDown size={12} />
                            </Button>
                            {headOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded shadow-lg max-h-48 flex flex-col">
                                    <div className="p-1.5 border-b border-border">
                                        <Input
                                            type="text"
                                            value={headFilter}
                                            onChange={(e) => setHeadFilter(e.target.value)}
                                            placeholder="Filter branches…"
                                            className="h-6 text-[10px]"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="overflow-y-auto">
                                        {filteredHeadBranches.map((b) => (
                                            <Button
                                                key={b}
                                                variant="ghost"
                                                className={`w-full justify-start rounded-none text-[10px] h-auto px-2 py-1.5 ${b === headBranch ? 'bg-accent/10 text-accent' : ''}`}
                                                onClick={() => {
                                                    setHeadBranch(b);
                                                    setHeadOpen(false);
                                                }}
                                            >
                                                {b}
                                                {b === currentBranch && (
                                                    <Badge
                                                        variant="outline"
                                                        className="ml-auto text-[8px] px-1 py-0"
                                                    >
                                                        current
                                                    </Badge>
                                                )}
                                            </Button>
                                        ))}
                                        {filteredHeadBranches.length === 0 && (
                                            <div className="px-2 py-2 text-[10px] text-fg/30 text-center">
                                                No matching branches
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center text-fg/20 text-[10px]">
                        ↓ merging into ↓
                    </div>

                    {/* Base branch */}
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-fg/50">
                            <GitBranch size={10} className="inline mr-1" />
                            Target branch (base)
                        </Label>
                        <div className="relative" ref={baseRef}>
                            <Button
                                variant="outline"
                                className="w-full justify-between text-[11px] h-8"
                                onClick={() => {
                                    setBaseOpen(!baseOpen);
                                    setBaseFilter('');
                                }}
                            >
                                <span className="truncate">
                                    {baseBranch || 'Select branch…'}
                                </span>
                                <ChevronDown size={12} />
                            </Button>
                            {baseOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded shadow-lg max-h-48 flex flex-col">
                                    <div className="p-1.5 border-b border-border">
                                        <Input
                                            type="text"
                                            value={baseFilter}
                                            onChange={(e) => setBaseFilter(e.target.value)}
                                            placeholder="Filter branches…"
                                            className="h-6 text-[10px]"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="overflow-y-auto">
                                        {filteredBaseBranches.map((b) => (
                                            <Button
                                                key={b}
                                                variant="ghost"
                                                className={`w-full justify-start rounded-none text-[10px] h-auto px-2 py-1.5 ${b === baseBranch ? 'bg-accent/10 text-accent' : ''}`}
                                                onClick={() => {
                                                    setBaseBranch(b);
                                                    setBaseOpen(false);
                                                }}
                                            >
                                                {b}
                                            </Button>
                                        ))}
                                        {filteredBaseBranches.length === 0 && (
                                            <div className="px-2 py-2 text-[10px] text-fg/30 text-center">
                                                No matching branches
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Title */}
                <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-fg/50">Title</Label>
                    <Input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="PR title…"
                        className="text-[12px]"
                    />
                </div>

                {/* Body with AI summary button */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-fg/50">Description</Label>
                        <div className="flex-1" />
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px] text-purple-400/70 hover:text-purple-400 border-purple-400/20 hover:border-purple-400/40"
                            onClick={handleGenerateSummary}
                            disabled={isGeneratingSummary || !baseBranch}
                            title="Generate PR description from diff using AI"
                        >
                            {isGeneratingSummary ? (
                                <Loader2 size={10} className="animate-spin" />
                            ) : (
                                <Sparkles size={10} />
                            )}
                            {isGeneratingSummary ? 'Generating…' : 'AI Summary'}
                        </Button>
                    </div>
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Describe your changes… or use AI Summary to generate"
                        rows={8}
                        className="text-[11px]"
                    />
                    {summaryError && (
                        <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                            <AlertCircle size={10} />
                            {summaryError}
                        </div>
                    )}
                </div>

                {/* System prompt editor */}
                <Collapsible open={showPromptEditor} onOpenChange={setShowPromptEditor}>
                    <CollapsibleTrigger
                        className="flex items-center gap-1 h-6 text-[10px] text-fg/40 hover:text-fg/70 px-1 cursor-pointer"
                    >
                        <Settings2 size={10} />
                        AI Summary System Prompt
                        <ChevronDown
                            size={10}
                            className={`transition-transform ${showPromptEditor ? 'rotate-180' : ''}`}
                        />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="mt-1">
                            <Textarea
                                value={prSummarySystemPrompt}
                                onChange={(e) => setPRSummarySystemPrompt(e.target.value)}
                                placeholder="Leave empty to use the default system prompt. Customize to change how the AI generates PR summaries."
                                rows={4}
                                className="text-[10px] text-fg/60"
                            />
                            <p className="text-[9px] text-fg/30 mt-1">
                                The AI receives the diff, stats, and commit log along with this prompt.
                            </p>
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* Draft toggle */}
                <div className="flex items-center gap-2">
                    <Switch
                        checked={isDraft}
                        onCheckedChange={setIsDraft}
                    />
                    <Label className="text-[11px] text-fg/60">
                        Create as draft PR
                    </Label>
                </div>

                {/* Error */}
                {createError && (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
                        <AlertCircle size={12} />
                        {createError}
                    </div>
                )}
            </div>

            {/* Footer: submit */}
            <div className="flex-shrink-0 border-t border-border p-3">
                <Button
                    className="w-full gap-2"
                    onClick={handleCreate}
                    disabled={!canCreate || isCreatingPR}
                >
                    {isCreatingPR ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <GitPullRequest size={14} />
                    )}
                    {isCreatingPR
                        ? 'Creating…'
                        : isDraft
                          ? 'Create Draft Pull Request'
                          : 'Create Pull Request'}
                </Button>
            </div>
        </div>
    );
};
