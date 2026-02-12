import * as vscode from 'vscode';
import { GitService } from './gitService';

/**
 * URI scheme: mystash:/stash@{index}/filepath?ref=stash|parent
 *
 * - ref=stash  → file content from the stash commit
 * - ref=parent → file content from the stash's parent commit (the base)
 *
 * Example: mystash:/stash@{0}/src/app.ts?ref=stash
 */
export class StashContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private gitService: GitService) {}

    async provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken): Promise<string> {
        const params = new URLSearchParams(uri.query);
        const ref = params.get('ref') ?? 'stash';
        const index = parseInt(params.get('index') ?? '0', 10);
        const filePath = uri.path.slice(1); // remove leading /

        try {
            if (ref === 'parent') {
                // Show the file as it was before the stash (parent of stash commit)
                const { stdout, exitCode } = await this.gitService.execGitPublic(
                    `show "stash@{${index}}^":"${filePath}"`
                );
                return exitCode === 0 ? stdout : '';
            } else {
                // Show the file as it is in the stash
                const { stdout, exitCode } = await this.gitService.execGitPublic(
                    `show "stash@{${index}}":"${filePath}"`
                );
                return exitCode === 0 ? stdout : '';
            }
        } catch {
            return '';
        }
    }
}
