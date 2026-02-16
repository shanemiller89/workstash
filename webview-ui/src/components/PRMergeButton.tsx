import React, { useState, useCallback } from 'react';
import { usePRStore, type PRMergeMethod } from '../prStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuGroup,
} from './ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog';
import {
    GitMerge,
    ChevronDown,
    Loader2,
    GitBranch,
    Layers,
} from 'lucide-react';

const mergeMethodConfig: Record<PRMergeMethod, { label: string; description: string; icon: React.ReactNode }> = {
    merge: {
        label: 'Merge commit',
        description: 'All commits will be added with a merge commit',
        icon: <GitMerge size={12} />,
    },
    squash: {
        label: 'Squash and merge',
        description: 'All commits will be squashed into one commit',
        icon: <Layers size={12} />,
    },
    rebase: {
        label: 'Rebase and merge',
        description: 'All commits will be rebased onto the base branch',
        icon: <GitBranch size={12} />,
    },
};

interface PRMergeButtonProps {
    prNumber: number;
    prTitle: string;
    baseBranch: string;
    headBranch: string;
}

export const PRMergeButton: React.FC<PRMergeButtonProps> = ({
    prNumber,
    prTitle,
    baseBranch,
    headBranch,
}) => {
    const isMerging = usePRStore((s) => s.isMerging);
    const mergeError = usePRStore((s) => s.mergeError);

    const [method, setMethod] = useState<PRMergeMethod>('merge');
    const [showConfirm, setShowConfirm] = useState(false);

    const selectedConfig = mergeMethodConfig[method];

    const handleMerge = useCallback(() => {
        postMessage('prs.mergePR', {
            prNumber,
            mergeMethod: method,
            commitTitle: method === 'squash'
                ? `${prTitle} (#${prNumber})`
                : undefined,
        });
        setShowConfirm(false);
    }, [prNumber, method, prTitle]);

    return (
        <>
            <div className="flex items-center gap-0">
                {/* Main merge button */}
                <Button
                    size="sm"
                    className="h-7 gap-1 text-[11px] rounded-r-none bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setShowConfirm(true)}
                    disabled={isMerging}
                >
                    {isMerging ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : (
                        selectedConfig.icon
                    )}
                    {isMerging ? 'Merging…' : selectedConfig.label}
                </Button>

                {/* Method selector dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                size="sm"
                                className="h-7 px-1.5 rounded-l-none border-l border-green-700/50 bg-green-600 hover:bg-green-700 text-white"
                                disabled={isMerging}
                            />
                        }
                    >
                        <ChevronDown size={12} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                        <DropdownMenuGroup>
                            <DropdownMenuLabel>Merge method</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(Object.entries(mergeMethodConfig) as [PRMergeMethod, typeof mergeMethodConfig[PRMergeMethod]][]).map(
                                ([key, cfg]) => (
                                    <DropdownMenuItem
                                        key={key}
                                        onClick={() => setMethod(key)}
                                    >
                                        <div className="flex items-center gap-2">
                                            {cfg.icon}
                                            <div>
                                                <div className="font-medium">{cfg.label}</div>
                                                <div className="text-[10px] opacity-60">{cfg.description}</div>
                                            </div>
                                            {method === key && (
                                                <span className="ml-auto text-accent">✓</span>
                                            )}
                                        </div>
                                    </DropdownMenuItem>
                                ),
                            )}
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Merge error */}
            {mergeError && (
                <div className="text-[10px] text-red-400 mt-1">
                    {mergeError}
                </div>
            )}

            {/* Confirmation dialog */}
            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Merge pull request</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will {method === 'squash' ? 'squash and merge' : method === 'rebase' ? 'rebase and merge' : 'merge'}{' '}
                            <span className="font-mono font-medium">{headBranch}</span> into{' '}
                            <span className="font-mono font-medium">{baseBranch}</span>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleMerge}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            Confirm merge
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
