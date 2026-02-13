import React from 'react';
import { useAppStore } from '../appStore';
import { Archive, StickyNote, GitPullRequest, CircleDot } from 'lucide-react';

const tabs = [
    { key: 'stashes' as const, label: 'Stashes', Icon: Archive },
    { key: 'notes' as const, label: 'Notes', Icon: StickyNote },
    { key: 'prs' as const, label: 'PRs', Icon: GitPullRequest },
    { key: 'issues' as const, label: 'Issues', Icon: CircleDot },
] as const;

export const TabBar: React.FC = () => {
    const activeTab = useAppStore((s) => s.activeTab);
    const setActiveTab = useAppStore((s) => s.setActiveTab);

    return (
        <div className="flex border-b border-border bg-card flex-shrink-0 select-none">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium transition-colors border-b-2 ${
                            isActive
                                ? 'border-accent text-fg'
                                : 'border-transparent text-fg/50 hover:text-fg/80 hover:bg-hover'
                        }`}
                        onClick={() => setActiveTab(tab.key)}
                        role="tab"
                        aria-selected={isActive}
                    >
                        <tab.Icon size={14} />
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
};
