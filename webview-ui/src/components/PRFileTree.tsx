import React, { useState, useMemo, useCallback } from 'react';
import { usePRStore, type PRFileData } from '../prStore';
import {
    ChevronDown,
    ChevronRight,
    File,
    FolderOpen,
    Folder,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

/** Status badge config for file changes */
const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    added: { label: 'A', color: 'text-added', bg: 'bg-added/15' },
    removed: { label: 'D', color: 'text-deleted', bg: 'bg-deleted/15' },
    modified: { label: 'M', color: 'text-modified', bg: 'bg-modified/15' },
    renamed: { label: 'R', color: 'text-accent', bg: 'bg-accent/15' },
    copied: { label: 'C', color: 'text-added', bg: 'bg-added/15' },
    changed: { label: 'M', color: 'text-modified', bg: 'bg-modified/15' },
    unchanged: { label: 'U', color: 'text-fg/30', bg: 'bg-fg/5' },
};

/** Tree node: either a directory (children) or a file (leaf) */
interface TreeNode {
    name: string;
    path: string;
    isDir: boolean;
    children: TreeNode[];
    file?: PRFileData;
}

/** Build a directory tree from flat file paths */
function buildTree(files: PRFileData[]): TreeNode[] {
    const root: TreeNode = { name: '', path: '', isDir: true, children: [] };

    for (const file of files) {
        const parts = file.filename.split('/');
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            const partPath = parts.slice(0, i + 1).join('/');

            if (isLast) {
                current.children.push({
                    name: part,
                    path: partPath,
                    isDir: false,
                    children: [],
                    file,
                });
            } else {
                let dir = current.children.find((c) => c.isDir && c.name === part);
                if (!dir) {
                    dir = { name: part, path: partPath, isDir: true, children: [] };
                    current.children.push(dir);
                }
                current = dir;
            }
        }
    }

    // Collapse single-child directories (e.g., src/components → src/components)
    function collapse(node: TreeNode): TreeNode {
        if (node.isDir && node.children.length === 1 && node.children[0].isDir) {
            const child = node.children[0];
            return collapse({
                name: `${node.name}/${child.name}`,
                path: child.path,
                isDir: true,
                children: child.children,
            });
        }
        return {
            ...node,
            children: node.children.map(collapse),
        };
    }

    // Sort: dirs first, then files alphabetically
    function sortTree(nodes: TreeNode[]): TreeNode[] {
        return nodes
            .sort((a, b) => {
                if (a.isDir !== b.isDir) { return a.isDir ? -1 : 1; }
                return a.name.localeCompare(b.name);
            })
            .map((node) =>
                node.isDir ? { ...node, children: sortTree(node.children) } : node,
            );
    }

    return sortTree(root.children.map(collapse));
}

/** A single directory row */
const DirNode: React.FC<{
    node: TreeNode;
    depth: number;
    selectedFilePath: string | null;
    onSelectFile: (path: string) => void;
    expandedDirs: Set<string>;
    toggleDir: (path: string) => void;
}> = ({ node, depth, selectedFilePath, onSelectFile, expandedDirs, toggleDir }) => {
    const isExpanded = expandedDirs.has(node.path);

    // Count total additions/deletions for the dir
    const stats = useMemo(() => {
        let additions = 0;
        let deletions = 0;
        let count = 0;
        function walk(n: TreeNode) {
            if (n.file) {
                additions += n.file.additions;
                deletions += n.file.deletions;
                count++;
            }
            n.children.forEach(walk);
        }
        walk(node);
        return { additions, deletions, count };
    }, [node]);

    return (
        <div>
            <div
                className="flex items-center gap-1 px-1.5 py-0.5 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] rounded text-[11px]"
                style={{ paddingLeft: `${depth * 12 + 6}px` }}
                onClick={() => toggleDir(node.path)}
            >
                {isExpanded ? (
                    <ChevronDown size={12} className="text-fg/40 shrink-0" />
                ) : (
                    <ChevronRight size={12} className="text-fg/40 shrink-0" />
                )}
                {isExpanded ? (
                    <FolderOpen size={12} className="text-accent/70 shrink-0" />
                ) : (
                    <Folder size={12} className="text-accent/70 shrink-0" />
                )}
                <span className="truncate font-medium">{node.name}</span>
                <span className="text-[9px] text-fg/30 shrink-0 ml-auto">
                    {stats.count} file{stats.count !== 1 ? 's' : ''}
                </span>
            </div>
            {isExpanded && (
                <div>
                    {node.children.map((child) =>
                        child.isDir ? (
                            <DirNode
                                key={child.path}
                                node={child}
                                depth={depth + 1}
                                selectedFilePath={selectedFilePath}
                                onSelectFile={onSelectFile}
                                expandedDirs={expandedDirs}
                                toggleDir={toggleDir}
                            />
                        ) : (
                            <FileNode
                                key={child.path}
                                node={child}
                                depth={depth + 1}
                                isSelected={selectedFilePath === child.file?.filename}
                                onSelect={() => child.file && onSelectFile(child.file.filename)}
                            />
                        ),
                    )}
                </div>
            )}
        </div>
    );
};

/** A single file row */
const FileNode: React.FC<{
    node: TreeNode;
    depth: number;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ node, depth, isSelected, onSelect }) => {
    const file = node.file!;
    const cfg = statusConfig[file.status] ?? statusConfig.changed;

    return (
        <div
            className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 cursor-pointer rounded text-[11px] font-mono',
                isSelected
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                    : 'hover:bg-[var(--vscode-list-hoverBackground)]',
            )}
            style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
            onClick={onSelect}
        >
            <File size={12} className="text-fg/40 shrink-0" />
            <span className="truncate">{node.name}</span>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
                {file.additions > 0 && (
                    <span className="text-[9px] text-added">+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                    <span className="text-[9px] text-deleted">-{file.deletions}</span>
                )}
                <Badge
                    variant="outline"
                    className={cn(
                        'text-[8px] px-1 py-0 border-none font-bold leading-tight',
                        cfg.color,
                        cfg.bg,
                    )}
                >
                    {cfg.label}
                </Badge>
            </div>
        </div>
    );
};

export const PRFileTree: React.FC = () => {
    const prFiles = usePRStore((s) => s.prFiles);
    const selectedFilePath = usePRStore((s) => s.selectedFilePath);
    const selectFile = usePRStore((s) => s.selectFile);

    // Start with all directories expanded
    const allDirPaths = useMemo(() => {
        const dirs = new Set<string>();
        for (const file of prFiles) {
            const parts = file.filename.split('/');
            for (let i = 1; i < parts.length; i++) {
                dirs.add(parts.slice(0, i).join('/'));
            }
        }
        return dirs;
    }, [prFiles]);

    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(allDirPaths);

    // Rebuild expanded set when files change
    React.useEffect(() => {
        setExpandedDirs(allDirPaths);
    }, [allDirPaths]);

    const toggleDir = useCallback((path: string) => {
        setExpandedDirs((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const tree = useMemo(() => buildTree(prFiles), [prFiles]);

    const totalStats = useMemo(() => {
        let additions = 0;
        let deletions = 0;
        for (const f of prFiles) {
            additions += f.additions;
            deletions += f.deletions;
        }
        return { additions, deletions };
    }, [prFiles]);

    if (prFiles.length === 0) {
        return (
            <div className="text-[11px] text-fg/30 italic px-3 py-4 text-center">
                No files changed
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            {/* Summary header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-[10px] text-fg/40">
                <span>{prFiles.length} file{prFiles.length !== 1 ? 's' : ''} changed</span>
                <div className="flex-1" />
                <span className="text-added">+{totalStats.additions}</span>
                <span className="text-deleted">-{totalStats.deletions}</span>
            </div>
            {/* Tree */}
            <div className="py-1 overflow-y-auto">
                {tree.map((node) =>
                    node.isDir ? (
                        <DirNode
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedFilePath={selectedFilePath}
                            onSelectFile={selectFile}
                            expandedDirs={expandedDirs}
                            toggleDir={toggleDir}
                        />
                    ) : (
                        <FileNode
                            key={node.path}
                            node={node}
                            depth={0}
                            isSelected={selectedFilePath === node.file?.filename}
                            onSelect={() => node.file && selectFile(node.file.filename)}
                        />
                    ),
                )}
            </div>
        </div>
    );
};
