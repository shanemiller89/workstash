import * as vscode from 'vscode';
import { GitService, StashEntry } from './gitService';
import { StashItem, StashFileItem } from './stashItem';

export class StashProvider implements vscode.TreeDataProvider<StashItem | StashFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StashItem | StashFileItem | undefined | null | void> = new vscode.EventEmitter<StashItem | StashFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StashItem | StashFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private gitService: GitService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StashItem | StashFileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StashItem | StashFileItem): Promise<(StashItem | StashFileItem)[]> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('No workspace folder open');
            return [];
        }

        const isGitRepo = await this.gitService.isGitRepository();
        if (!isGitRepo) {
            vscode.window.showInformationMessage('Not a git repository');
            return [];
        }

        if (element instanceof StashItem) {
            // Return files for this stash
            try {
                const files = await this.gitService.getStashFiles(element.stashEntry.index);
                return files.map(file => new StashFileItem(file, element.stashEntry.index));
            } catch {
                return [];
            }
        }

        // Return stash list
        const stashes = await this.gitService.getStashList();
        return stashes.map(stash => new StashItem(stash, vscode.TreeItemCollapsibleState.Collapsed));
    }
}
