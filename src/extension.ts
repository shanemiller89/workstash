import * as vscode from 'vscode';
import { GitService } from './gitService';
import { StashProvider } from './stashProvider';
import { StashItem, StashFileItem } from './stashItem';
import { StashContentProvider } from './stashContentProvider';
import { StashPanel } from './stashPanel';
import { pickStash } from './uiUtils';
import { getConfig } from './utils';

export function activate(context: vscode.ExtensionContext) {
	console.log('MyStash extension is now active!');

	// 0b-i: Create output channel for diagnostics
	const outputChannel = vscode.window.createOutputChannel('MyStash');
	context.subscriptions.push(outputChannel);

	const gitService = new GitService(outputChannel);

	// Register mystash: URI scheme for side-by-side diff viewing
	const contentProvider = new StashContentProvider(gitService);
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('mystash', contentProvider)
	);

	const stashProvider = new StashProvider(gitService, outputChannel);

	// Register the tree view
	const treeView = vscode.window.createTreeView('mystashView', {
		treeDataProvider: stashProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);
	stashProvider.setTreeView(treeView);

	// 1e-ii: Watch git stash ref files for changes
	// TODO: multi-root — watch all workspace folder .git directories
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
	if (workspaceRoot) {
		const stashRefPattern = new vscode.RelativePattern(workspaceRoot, '.git/{refs/stash,logs/refs/stash}');
		const gitWatcher = vscode.workspace.createFileSystemWatcher(stashRefPattern);
		gitWatcher.onDidChange(() => stashProvider.refresh('git-stash-changed'));
		gitWatcher.onDidCreate(() => stashProvider.refresh('git-stash-created'));
		gitWatcher.onDidDelete(() => stashProvider.refresh('git-stash-deleted'));
		context.subscriptions.push(gitWatcher);
	}

	// 1e-iii: Refresh on window focus (e.g. after external git operations)
	context.subscriptions.push(
		vscode.window.onDidChangeWindowState((state) => {
			if (state.focused && getConfig<boolean>('autoRefresh', true)) {
				stashProvider.refresh('window-focus');
			}
		})
	);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.refresh', () => {
			stashProvider.refresh('manual');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.stash', async () => {
			const message = await vscode.window.showInputBox({
				prompt: 'Enter stash message (optional)',
				placeHolder: 'Stash message'
			});

			const includeUntracked = await vscode.window.showQuickPick(['No', 'Yes'], {
				placeHolder: 'Include untracked files?'
			});

			try {
				await gitService.createStash(message, includeUntracked === 'Yes');
				vscode.window.showInformationMessage('Stash created successfully');
				stashProvider.refresh('post-command');
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to create stash: ${error.message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.apply', async (item?: StashItem) => {
			if (!item) {
				const entry = await pickStash(gitService, 'Select a stash to apply');
				if (!entry) { return; }
				item = new StashItem(entry);
			}

			try {
				await gitService.applyStash(item.stashEntry.index);
				vscode.window.showInformationMessage(`Applied ${item.stashEntry.name}`);
				stashProvider.refresh('post-command');
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to apply stash: ${error.message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.pop', async (item?: StashItem) => {
			if (!item) {
				const entry = await pickStash(gitService, 'Select a stash to pop');
				if (!entry) { return; }
				item = new StashItem(entry);
			}

			try {
				await gitService.popStash(item.stashEntry.index);
				vscode.window.showInformationMessage(`Popped ${item.stashEntry.name}`);
				stashProvider.refresh('post-command');
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to pop stash: ${error.message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.drop', async (item?: StashItem) => {
			if (!item) {
				const entry = await pickStash(gitService, 'Select a stash to drop');
				if (!entry) { return; }
				item = new StashItem(entry);
			}

			const confirm = await vscode.window.showWarningMessage(
				`Are you sure you want to drop ${item.stashEntry.name}?`,
				{ modal: true },
				'Yes', 'No'
			);

			if (confirm !== 'Yes') {
				return;
			}

			try {
				await gitService.dropStash(item.stashEntry.index);
				vscode.window.showInformationMessage(`Dropped ${item.stashEntry.name}`);
				stashProvider.refresh('post-command');
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to drop stash: ${error.message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.show', async (item?: StashItem) => {
			if (!item) {
				const entry = await pickStash(gitService, 'Select a stash to show');
				if (!entry) { return; }
				item = new StashItem(entry);
			}

			try {
				const diff = await gitService.getStashDiff(item.stashEntry.index);
				const document = await vscode.workspace.openTextDocument({
					content: diff,
					language: 'diff'
				});
				await vscode.window.showTextDocument(document, { preview: true });
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to show stash: ${error.message}`);
			}
		})
	);

	// 6c: Per-file diff command — opens side-by-side diff editor
	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.showFile', async (fileItem?: StashFileItem) => {
			if (!fileItem) { return; }

			const index = fileItem.stashIndex;
			const filePath = fileItem.filePath;
			const fileName = filePath.split('/').pop() ?? filePath;

			// Build URIs for the parent (before) and stash (after) versions
			const parentUri = vscode.Uri.parse(
				`mystash:/${filePath}?ref=parent&index=${index}`
			);
			const stashUri = vscode.Uri.parse(
				`mystash:/${filePath}?ref=stash&index=${index}`
			);

			const title = `${fileName} (stash@{${index}})`;

			try {
				await vscode.commands.executeCommand('vscode.diff', parentUri, stashUri, title, {
					preview: true
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				vscode.window.showErrorMessage(`Failed to show file diff: ${message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.openPanel', () => {
			StashPanel.createOrShow(context.extensionUri, gitService);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mystash.clear', async () => {
			const stashes = await gitService.getStashList();
			if (stashes.length === 0) {
				vscode.window.showInformationMessage('No stashes to clear');
				return;
			}

			const confirm = await vscode.window.showWarningMessage(
				`Are you sure you want to clear all ${stashes.length} stash(es)? This cannot be undone.`,
				{ modal: true },
				'Yes', 'No'
			);

			if (confirm !== 'Yes') {
				return;
			}

			try {
				await gitService.clearStashes();
				vscode.window.showInformationMessage('All stashes cleared');
				stashProvider.refresh('post-command');
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to clear stashes: ${error.message}`);
			}
		})
	);
}

export function deactivate() {}
