import React from 'react';
import type { StashFileData } from '../store';
import { postMessage } from '../vscode';

const statusConfig: Record<string, { label: string; color: string }> = {
    M: { label: 'M', color: 'text-modified' },
    A: { label: 'A', color: 'text-added' },
    D: { label: 'D', color: 'text-deleted' },
    R: { label: 'R', color: 'text-accent' },
    C: { label: 'C', color: 'text-added' },
};

export const StashFiles: React.FC<{
    files: StashFileData[];
    stashIndex: number;
}> = ({ files, stashIndex }) => (
    <div className="border-t border-border px-3 py-2 pl-6">
        {files.map((file) => {
            const cfg = statusConfig[file.status] ?? { label: '?', color: 'opacity-50' };
            const parts = file.path.split('/');
            const name = parts.pop() ?? file.path;
            const dir = parts.join('/');

            return (
                <div
                    key={file.path}
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-hover text-[12px] font-mono"
                    onClick={() =>
                        postMessage('showFile', { index: stashIndex, filePath: file.path })
                    }
                >
                    <span
                        className={`w-4 text-center text-[10px] font-bold flex-shrink-0 ${cfg.color}`}
                    >
                        {cfg.label}
                    </span>
                    <span className="font-medium text-fg">{name}</span>
                    {dir && <span className="opacity-40 text-[11px]">{dir}</span>}
                </div>
            );
        })}
    </div>
);
