import * as vscode from 'vscode';
import { StashEntry } from './gitService';

export class StashItem extends vscode.TreeItem {
    constructor(
        public readonly stashEntry: StashEntry,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(stashEntry.message, collapsibleState);
        
        this.tooltip = `${stashEntry.name}\nBranch: ${stashEntry.branch}\n${stashEntry.message}`;
        this.description = `${stashEntry.name} on ${stashEntry.branch}`;
        this.iconPath = new vscode.ThemeIcon('archive');
        this.contextValue = 'stashItem';
    }
}

export class StashFileItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        public readonly stashIndex: number
    ) {
        super(filePath, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = filePath;
        this.iconPath = new vscode.ThemeIcon('file');
        this.contextValue = 'stashFileItem';
    }
}
