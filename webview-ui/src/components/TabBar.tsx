import React from 'react';
import { useAppStore } from '../appStore';
import { useAIStore } from '../aiStore';
import { postMessage } from '../vscode';
import { Archive, StickyNote, GitPullRequest, CircleDot, MessageSquare, Kanban, Bot, Wand2, Key, Settings, HardDrive } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { RepoSwitcher } from './RepoSwitcher';

const tabs = [
    { key: 'mattermost' as const, label: 'Chat', Icon: MessageSquare },
    { key: 'notes' as const, label: 'Notes', Icon: StickyNote },
    { key: 'prs' as const, label: 'PRs', Icon: GitPullRequest },
    { key: 'issues' as const, label: 'Issues', Icon: CircleDot },
    { key: 'projects' as const, label: 'Projects', Icon: Kanban },
    { key: 'drive' as const, label: 'Drive', Icon: HardDrive },
    { key: 'agent' as const, label: 'Agent', Icon: Wand2 },
] as const;

export const TabBar: React.FC = () => {
    const activeTab = useAppStore((s) => s.activeTab);
    const setActiveTab = useAppStore((s) => s.setActiveTab);

    const isStashActive = activeTab === 'stashes';
    const chatPanelOpen = useAIStore((s) => s.chatPanelOpen);
    const toggleChatPanel = useAIStore((s) => s.toggleChatPanel);
    const aiAvailable = useAIStore((s) => s.aiAvailable);
    const aiProvider = useAIStore((s) => s.aiProvider);

    // Filter out AI-only tabs when no AI provider is available
    const visibleTabs = aiAvailable ? tabs : tabs.filter((t) => t.key !== 'agent');

    return (
        <div className="flex border-b border-border bg-card flex-shrink-0 select-none">
            {visibleTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <Button
                        key={tab.key}
                        variant="ghost"
                        className={`rounded-none h-auto px-4 py-2 text-[12px] font-medium border-b-2 gap-1.5 ${
                            isActive
                                ? 'border-accent text-fg'
                                : 'border-transparent text-fg/50 hover:text-fg/80'
                        }`}
                        onClick={() => setActiveTab(tab.key)}
                        role="tab"
                        aria-selected={isActive}
                    >
                        <tab.Icon size={14} />
                        {tab.label}
                    </Button>
                );
            })}
            {/* Stash — icon-only, pushed to far right + repo switcher */}
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
            </div>
        </div>
    );
};
