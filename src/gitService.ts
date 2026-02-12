import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface StashEntry {
    index: number;
    name: string;
    branch: string;
    message: string;
    date: Date;
    stats?: {
        filesChanged: number;
        insertions: number;
        deletions: number;
    };
}

export type FileStatus = 'M' | 'A' | 'D' | 'R' | 'C';

export interface StashFileEntry {
    path: string;
    status: FileStatus;
}

export class GitService {
    private workspaceRoot: string | undefined;
    private _outputChannel: vscode.OutputChannel | undefined;

    constructor(outputChannel?: vscode.OutputChannel) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this._outputChannel = outputChannel;
        // TODO: multi-root — accept workspaceRoot as parameter instead of hardcoding [0]
    }

    private async execGit(command: string): Promise<GitResult> {
        if (!this.workspaceRoot) {
            return { stdout: '', stderr: 'No workspace folder open', exitCode: 1 };
        }

        this._outputChannel?.appendLine(`[GIT] git ${command}`);

        try {
            const { stdout, stderr } = await execAsync(`git ${command}`, {
                cwd: this.workspaceRoot
            });
            this._outputChannel?.appendLine(`[GIT] exit 0`);
            return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
        } catch (error: unknown) {
            const err = error as { stdout?: string; stderr?: string; code?: unknown; message?: string };
            const exitCode = typeof err.code === 'number' ? err.code : 1;
            const stdout = (err.stdout ?? '').trim();
            const stderr = (err.stderr ?? err.message ?? 'Unknown git error').trim();
            this._outputChannel?.appendLine(`[GIT] exit ${exitCode}`);
            if (stderr) {
                this._outputChannel?.appendLine(`[GIT] stderr: ${stderr}`);
            }
            return { stdout, stderr, exitCode };
        }
    }

    /**
     * Public access to execGit for TextDocumentContentProvider.
     * Callers are responsible for quoting arguments.
     */
    async execGitPublic(command: string): Promise<GitResult> {
        return this.execGit(command);
    }

    async getStashList(): Promise<StashEntry[]> {
        // Use --format for structured output: ref|ISO-date|subject
        const { stdout, exitCode } = await this.execGit('stash list --format="%gd|%ai|%gs"');
        if (exitCode !== 0 || !stdout) {
            return [];
        }

        return stdout.split('\n').map((line, fallbackIndex) => {
            // Format: stash@{0}|2026-02-10 14:23:05 -0600|On main: my message
            // Safe split: preserve | in message content
            const [ref, isoDate, ...subjectParts] = line.split('|');
            const subject = subjectParts.join('|');

            // Parse stash index from ref
            const refMatch = ref?.match(/stash@\{(\d+)\}/);
            const index = refMatch ? parseInt(refMatch[1], 10) : fallbackIndex;
            const name = refMatch ? `stash@{${refMatch[1]}}` : `stash@{${fallbackIndex}}`;

            // Parse date
            const date = isoDate ? new Date(isoDate.trim()) : new Date();

            // Parse subject: "WIP on branch: ..." or "On branch: ..."
            const subjectMatch = subject?.match(/^\s*(?:WIP on|On)\s+(.+?):\s*(.*)/);

            let branch = 'unknown';
            let message = line; // Fallback: raw line

            if (subjectMatch) {
                branch = subjectMatch[1].trim();
                const rawMessage = subjectMatch[2].trim();

                // Detect WIP-only messages: starts with a commit hash (7+ hex chars)
                if (!rawMessage || /^[a-f0-9]{7,}\s/.test(rawMessage) || /^[a-f0-9]{7,}$/.test(rawMessage)) {
                    message = '(no message)';
                } else {
                    message = rawMessage;
                }
            }

            return { index, name, branch, message, date };
        });
    }

    async createStash(message?: string, includeUntracked: boolean = false): Promise<void> {
        let command = 'stash push';
        if (includeUntracked) {
            command += ' --include-untracked';
        }
        if (message) {
            command += ` -m "${message}"`;
        }
        const { stderr, exitCode } = await this.execGit(command);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to create stash');
        }
    }

    async applyStash(index: number): Promise<void> {
        const { stderr, exitCode } = await this.execGit(`stash apply "stash@{${index}}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to apply stash');
        }
    }

    async popStash(index: number): Promise<void> {
        const { stderr, exitCode } = await this.execGit(`stash pop "stash@{${index}}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to pop stash');
        }
    }

    async dropStash(index: number): Promise<void> {
        const { stderr, exitCode } = await this.execGit(`stash drop "stash@{${index}}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to drop stash');
        }
    }

    async clearStashes(): Promise<void> {
        const { stderr, exitCode } = await this.execGit('stash clear');
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to clear stashes');
        }
    }

    async getStashDiff(index: number): Promise<string> {
        const { stdout, stderr, exitCode } = await this.execGit(`stash show -p "stash@{${index}}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to get stash diff');
        }
        return stdout;
    }

    async getStashFiles(index: number): Promise<string[]> {
        const { stdout, stderr, exitCode } = await this.execGit(`stash show --name-only "stash@{${index}}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to get stash files');
        }
        return stdout.split('\n').filter(line => line.trim());
    }

    async getStashStats(index: number): Promise<StashEntry['stats']> {
        const { stdout, exitCode } = await this.execGit(`stash show --stat "stash@{${index}}"`);
        if (exitCode !== 0 || !stdout) {
            return undefined;
        }

        // Last line: " 3 files changed, 12 insertions(+), 5 deletions(-)"
        const lines = stdout.split('\n');
        const lastLine = lines[lines.length - 1];
        const statsRegex = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;
        const match = lastLine.match(statsRegex);
        if (!match) {
            return undefined;
        }

        return {
            filesChanged: parseInt(match[1], 10),
            insertions: parseInt(match[2] ?? '0', 10),
            deletions: parseInt(match[3] ?? '0', 10)
        };
    }

    async getStashFilesWithStatus(index: number): Promise<StashFileEntry[]> {
        const { stdout, stderr, exitCode } = await this.execGit(`stash show --name-status stash@{${index}}`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to get stash files with status');
        }

        return stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [status, ...pathParts] = line.split('\t');
                return {
                    path: pathParts.join('\t').trim(),
                    status: (status?.trim() ?? 'M').charAt(0) as FileStatus
                };
            });
    }

    async getStashFileContent(index: number, filePath: string): Promise<string> {
        const { stdout, stderr, exitCode } = await this.execGit(`show "stash@{${index}}":"${filePath}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to get stash file content');
        }
        return stdout;
    }

    async getStashFileDiff(index: number, filePath: string): Promise<string> {
        const { stdout, stderr, exitCode } = await this.execGit(`stash show -p "stash@{${index}}" -- "${filePath}"`);
        if (exitCode !== 0) {
            throw new Error(stderr || 'Failed to get stash file diff');
        }
        return stdout;
    }

    async hasChanges(): Promise<boolean> {
        const { stdout, exitCode } = await this.execGit('status --porcelain');
        return exitCode === 0 && stdout.length > 0;
    }

    async isGitRepository(): Promise<boolean> {
        const { exitCode } = await this.execGit('rev-parse --is-inside-work-tree');
        return exitCode === 0;
    }
}
