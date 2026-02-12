import * as vscode from 'vscode';
import { GitService, StashEntry } from './gitService';

/**
 * Shows a QuickPick for stash selection. Returns the selected StashEntry,
 * or `undefined` if the user cancelled or no stashes exist.
 *
 * @param gitService - The GitService instance to fetch stash list from
 * @param prompt - Placeholder text for the QuickPick
 * @returns The selected StashEntry, or undefined
 */
export async function pickStash(
    gitService: GitService,
    prompt: string,
): Promise<StashEntry | undefined> {
    const stashes = await gitService.getStashList();

    if (stashes.length === 0) {
        vscode.window.showInformationMessage('No stashes available');
        return undefined;
    }

    const selected = await vscode.window.showQuickPick(
        stashes.map((s) => ({
            label: s.message,
            description: s.name,
            stash: s,
        })),
        { placeHolder: prompt },
    );

    return selected?.stash;
}
