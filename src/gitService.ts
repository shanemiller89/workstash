import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface StashEntry {
    index: number;
    name: string;
    branch: string;
    message: string;
}

export class GitService {
    private workspaceRoot: string | undefined;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    private async execGit(command: string): Promise<string> {
        if (!this.workspaceRoot) {
            throw new Error('No workspace folder open');
        }

        try {
            const { stdout } = await execAsync(`git ${command}`, {
                cwd: this.workspaceRoot
            });
            return stdout.trim();
        } catch (error: any) {
            throw new Error(error.stderr || error.message);
        }
    }

    async getStashList(): Promise<StashEntry[]> {
        try {
            const output = await this.execGit('stash list');
            if (!output) {
                return [];
            }

            return output.split('\n').map((line, index) => {
                // Format: stash@{0}: On branch-name: message
                // or: stash@{0}: WIP on branch-name: commit-hash message
                const match = line.match(/stash@\{(\d+)\}:\s*(?:WIP\s+)?(?:On\s+)?([^:]+):\s*(.*)/);
                if (match) {
                    return {
                        index: parseInt(match[1], 10),
                        name: `stash@{${match[1]}}`,
                        branch: match[2].trim(),
                        message: match[3].trim() || 'No message'
                    };
                }
                return {
                    index,
                    name: `stash@{${index}}`,
                    branch: 'unknown',
                    message: line
                };
            });
        } catch {
            return [];
        }
    }

    async createStash(message?: string, includeUntracked: boolean = false): Promise<void> {
        let command = 'stash push';
        if (includeUntracked) {
            command += ' --include-untracked';
        }
        if (message) {
            command += ` -m "${message}"`;
        }
        await this.execGit(command);
    }

    async applyStash(index: number): Promise<void> {
        await this.execGit(`stash apply stash@{${index}}`);
    }

    async popStash(index: number): Promise<void> {
        await this.execGit(`stash pop stash@{${index}}`);
    }

    async dropStash(index: number): Promise<void> {
        await this.execGit(`stash drop stash@{${index}}`);
    }

    async clearStashes(): Promise<void> {
        await this.execGit('stash clear');
    }

    async getStashDiff(index: number): Promise<string> {
        return await this.execGit(`stash show -p stash@{${index}}`);
    }

    async getStashFiles(index: number): Promise<string[]> {
        const output = await this.execGit(`stash show --name-only stash@{${index}}`);
        return output.split('\n').filter(line => line.trim());
    }

    async isGitRepository(): Promise<boolean> {
        try {
            await this.execGit('rev-parse --is-inside-work-tree');
            return true;
        } catch {
            return false;
        }
    }
}
