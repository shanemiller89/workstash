import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../appStore';
import { useAIStore } from '../aiStore';
import { postMessage } from '../vscode';
import {
    Archive, StickyNote, GitPullRequest, CircleDot, MessageSquare,
    Kanban, Bot, Wand2, Key, Settings, HardDrive, Calendar, BookOpen,
    ChevronDown, MoreHorizontal, Sparkles,
} from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from './ui/dropdown-menu';
import { RepoSwitcher } from './RepoSwitcher';

// ─── Tab / group definitions ──────────────────────────────────────

type TabKey = 'mattermost' | 'notes' | 'prs' | 'issues' | 'projects' | 'drive' | 'calendar' | 'wiki' | 'agent';

interface TabDef {
    key: TabKey;
    label: string;
    Icon: React.FC<{ size?: number }>;
}

/** A group with 2+ children renders as a dropdown; single-child groups render flat. */
interface TabGroup {
    id: string;
    label: string;
    Icon: React.FC<{ size?: number }>;
    children: TabDef[];
}

const TAB_GROUPS: TabGroup[] = [
    {
        id: 'chat',
        label: 'Chat',
        Icon: MessageSquare,
        children: [{ key: 'mattermost', label: 'Chat', Icon: MessageSquare }],
    },
    {
        id: 'notes',
        label: 'Notes',
        Icon: StickyNote,
        children: [{ key: 'notes', label: 'Notes', Icon: StickyNote }],
    },
    {
        id: 'github',
        label: 'GitHub',
        Icon: GitPullRequest,
        children: [
            { key: 'prs', label: 'PRs', Icon: GitPullRequest },
            { key: 'issues', label: 'Issues', Icon: CircleDot },
            { key: 'projects', label: 'Projects', Icon: Kanban },
            { key: 'wiki', label: 'Wiki', Icon: BookOpen },
        ],
    },
    {
        id: 'google',
        label: 'Google',
        Icon: HardDrive,
        children: [
            { key: 'drive', label: 'Drive', Icon: HardDrive },
            { key: 'calendar', label: 'Calendar', Icon: Calendar },
        ],
    },
    {
        id: 'agent',
        label: 'Agent',
        Icon: Wand2,
        children: [{ key: 'agent', label: 'Agent', Icon: Wand2 }],
    },
];

// ─── Shared tab button styling ────────────────────────────────────

const tabBtnBase = 'rounded-none h-auto px-4 py-2 text-[12px] font-medium border-b-2 gap-1.5';
const tabBtnActive = `${tabBtnBase} border-accent text-fg`;
const tabBtnInactive = `${tabBtnBase} border-transparent text-fg/50 hover:text-fg/80`;

// ─── Helpers ──────────────────────────────────────────────────────

/** Check if any child tab of a group is the active tab */
function groupContainsTab(group: TabGroup, activeTab: string): boolean {
    return group.children.some((t) => t.key === activeTab);
}

/** Get the active child within a group, or first child as default */
function activeChildInGroup(group: TabGroup, activeTab: string): TabDef {
    return group.children.find((t) => t.key === activeTab) ?? group.children[0];
}

// ─── Sub-components ───────────────────────────────────────────────

/** A flat tab button (for single-child groups and overflow items) */
const FlatTab: React.FC<{
    tab: TabDef;
    isActive: boolean;
    onSelect: (key: TabKey) => void;
}> = ({ tab, isActive, onSelect }) => (
    <Button
        variant="ghost"
        className={isActive ? tabBtnActive : tabBtnInactive}
        onClick={() => onSelect(tab.key)}
        role="tab"
        aria-selected={isActive}
    >
        <tab.Icon size={14} />
        {tab.label}
    </Button>
);

/** A dropdown group tab (for multi-child groups) */
const GroupTab: React.FC<{
    group: TabGroup;
    activeTab: string;
    onSelect: (key: TabKey) => void;
}> = ({ group, activeTab, onSelect }) => {
    const isActive = groupContainsTab(group, activeTab);
    const activeSub = activeChildInGroup(group, activeTab);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        className={isActive ? tabBtnActive : tabBtnInactive}
                        role="tab"
                        aria-selected={isActive}
                        aria-haspopup="true"
                    />
                }
            >
                <activeSub.Icon size={14} />
                {isActive ? activeSub.label : group.label}
                <ChevronDown size={10} className="opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                sideOffset={0}
                onClickCapture={(e: React.MouseEvent) => {
                    console.log('[TabBar] onClickCapture fired, target:', (e.target as HTMLElement).tagName, (e.target as HTMLElement).className?.slice(0, 40));
                    const target = (e.target as HTMLElement).closest?.('[data-tab-key]');
                    console.log('[TabBar] closest data-tab-key element:', target, target?.getAttribute('data-tab-key'));
                    if (target) {
                        const key = target.getAttribute('data-tab-key') as TabKey | null;
                        if (key) {
                            console.log('[TabBar] calling onSelect with key:', key);
                            onSelect(key);
                        }
                    }
                }}
            >
                {group.children.map((child) => (
                    <DropdownMenuItem
                        key={child.key}
                        data-tab-key={child.key}
                        className={child.key === activeTab ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : ''}
                        onClick={() => {
                            console.log('[TabBar] DropdownMenuItem onClick fired for key:', child.key);
                            onSelect(child.key);
                        }}
                    >
                        <child.Icon size={14} />
                        {child.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

/** Renders a single group entry — flat for 1 child, dropdown for 2+ */
const TabGroupEntry: React.FC<{
    group: TabGroup;
    activeTab: string;
    onSelect: (key: TabKey) => void;
}> = ({ group, activeTab, onSelect }) => {
    if (group.children.length === 1) {
        return <FlatTab tab={group.children[0]} isActive={activeTab === group.children[0].key} onSelect={onSelect} />;
    }
    return <GroupTab group={group} activeTab={activeTab} onSelect={onSelect} />;
};

// ─── Overflow "More…" menu ────────────────────────────────────────

const OverflowMenu: React.FC<{
    groups: TabGroup[];
    activeTab: string;
    onSelect: (key: TabKey) => void;
}> = ({ groups, activeTab, onSelect }) => {
    const hasActiveChild = groups.some((g) => groupContainsTab(g, activeTab));

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        className={hasActiveChild ? tabBtnActive : tabBtnInactive}
                        role="tab"
                        aria-label="More tabs"
                    />
                }
            >
                <MoreHorizontal size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                sideOffset={0}
                onClickCapture={(e: React.MouseEvent) => {
                    const target = (e.target as HTMLElement).closest?.('[data-tab-key]');
                    if (target) {
                        const key = target.getAttribute('data-tab-key') as TabKey | null;
                        if (key) {
                            onSelect(key);
                        }
                    }
                }}
            >
                {groups.flatMap((group) =>
                    group.children.map((child) => (
                        <DropdownMenuItem
                            key={child.key}
                            data-tab-key={child.key}
                            className={child.key === activeTab ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : ''}
                            onClick={() => onSelect(child.key)}
                        >
                            <child.Icon size={14} />
                            {child.label}
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

// ─── Main TabBar ──────────────────────────────────────────────────

/** Breakpoint (px) below which overflow kicks in. Matches ResizableLayout pattern. */
const OVERFLOW_BREAKPOINT = 520;

export const TabBar: React.FC = () => {
    const activeTab = useAppStore((s) => s.activeTab);
    const setActiveTab = useAppStore((s) => s.setActiveTab);

    const isStashActive = activeTab === 'stashes';
    const chatPanelOpen = useAIStore((s) => s.chatPanelOpen);
    const toggleChatPanel = useAIStore((s) => s.toggleChatPanel);
    const aiAvailable = useAIStore((s) => s.aiAvailable);
    const aiProvider = useAIStore((s) => s.aiProvider);
    const summaryPaneTabKey = useAIStore((s) => s.summaryPaneTabKey);
    const toggleSummaryPane = useAIStore((s) => s.toggleSummaryPane);

    // Summary is open for the currently active tab
    const summaryOpen = summaryPaneTabKey === activeTab;
    const handleToggleSummary = useCallback(() => {
        toggleSummaryPane(activeTab);
    }, [activeTab, toggleSummaryPane]);

    // ── Overflow detection via ResizeObserver ──
    const barRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        const el = barRef.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => {
            if (entry) {
                setIsNarrow(entry.contentRect.width < OVERFLOW_BREAKPOINT);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // ── Filter out Agent when AI unavailable ──
    const visibleGroups = useMemo(
        () => (aiAvailable ? TAB_GROUPS : TAB_GROUPS.filter((g) => g.id !== 'agent')),
        [aiAvailable]
    );

    // ── Split into visible tabs + overflow when narrow ──
    const { mainGroups, overflowGroups } = useMemo(() => {
        if (!isNarrow) {
            return { mainGroups: visibleGroups, overflowGroups: [] as TabGroup[] };
        }
        // Show first 3 groups, overflow the rest
        const splitAt = 3;
        return {
            mainGroups: visibleGroups.slice(0, splitAt),
            overflowGroups: visibleGroups.slice(splitAt),
        };
    }, [isNarrow, visibleGroups]);

    const handleSelectTab = useCallback(
        (key: TabKey) => {
            console.log('[TabBar] handleSelectTab called with:', key);
            setActiveTab(key);
        },
        [setActiveTab]
    );

    return (
        <div ref={barRef} className="flex border-b border-border bg-card shrink-0 select-none" role="tablist">
            {mainGroups.map((group) => (
                <TabGroupEntry key={group.id} group={group} activeTab={activeTab} onSelect={handleSelectTab} />
            ))}
            {overflowGroups.length > 0 && (
                <OverflowMenu groups={overflowGroups} activeTab={activeTab} onSelect={handleSelectTab} />
            )}
            {/* Right-side permanent buttons */}
            <div className="flex-1" />
            <div className="flex items-center gap-1 pr-1">
                <RepoSwitcher />
                <Button
                    variant="ghost"
                    className={`rounded-none h-auto px-3 py-2 border-b-2 ${
                        isStashActive
                            ? 'border-accent text-fg'
                            : 'border-transparent text-fg/50 hover:text-fg/80'
                    }`}
                    onClick={() => setActiveTab('stashes')}
                    role="tab"
                    aria-selected={isStashActive}
                    title="Stashes"
                >
                    <Archive size={14} />
                </Button>
                {aiAvailable && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger
                                render={<Button
                                    variant="ghost"
                                    className={`rounded-none h-auto px-3 py-2 border-b-2 ${
                                        summaryOpen
                                            ? 'border-accent text-accent'
                                            : 'border-transparent text-fg/50 hover:text-fg/80'
                                    }`}
                                    onClick={handleToggleSummary}
                                />}
                            >
                                <Sparkles size={14} />
                            </TooltipTrigger>
                            <TooltipContent>
                                {summaryOpen ? 'Close AI Summary' : 'AI Summary'}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                {aiAvailable ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger
                                render={<Button
                                    variant="ghost"
                                    className={`rounded-none h-auto px-3 py-2 border-b-2 ${
                                        chatPanelOpen
                                            ? 'border-accent text-accent'
                                            : 'border-transparent text-fg/50 hover:text-fg/80'
                                    }`}
                                    onClick={toggleChatPanel}
                                />}
                            >
                                <Bot size={14} />
                            </TooltipTrigger>
                            <TooltipContent>
                                {chatPanelOpen ? 'Close AI Chat' : 'Open AI Chat'} ({aiProvider === 'gemini' ? 'Gemini' : 'Copilot'})
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger
                                render={<Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="rounded-none h-auto px-3 py-2 border-b-2 border-transparent text-fg/30 hover:text-fg/60"
                                    onClick={() => postMessage('ai.configureGeminiKey')}
                                />}
                            >
                                <Key size={14} />
                            </TooltipTrigger>
                            <TooltipContent>
                                Configure Gemini API key to enable AI features
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                <Button
                    variant="ghost"
                    className={`rounded-none h-auto px-3 py-2 border-b-2 ${
                        activeTab === 'settings'
                            ? 'border-accent text-fg'
                            : 'border-transparent text-fg/50 hover:text-fg/80'
                    }`}
                    onClick={() => setActiveTab('settings')}
                    role="tab"
                    aria-selected={activeTab === 'settings'}
                    title="Settings"
                >
                    <Settings size={14} />
                </Button>
            </div>
        </div>
    );
};
