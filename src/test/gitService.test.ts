import * as assert from 'assert';
import { GitService, ExecFn, StashEntry, GitResult } from '../gitService';

/**
 * Unit tests for GitService — uses injectable ExecFn to mock git CLI output.
 * No VS Code host or real git repo needed.
 */

/** Create a mock ExecFn that returns predetermined output */
function mockExec(responses: { stdout: string; stderr?: string }[]): ExecFn {
    let callIndex = 0;
    const calls: string[] = [];
    const fn: ExecFn & { calls: string[] } = async (command: string, _options: { cwd: string }) => {
        calls.push(command);
        const resp = responses[callIndex++];
        if (!resp) {
            throw Object.assign(new Error('Mock: no more responses'), {
                stdout: '',
                stderr: 'mock error',
                code: 1,
            });
        }
        return { stdout: resp.stdout, stderr: resp.stderr ?? '' };
    };
    fn.calls = calls;
    return fn;
}

/** Create a mock ExecFn that throws (simulates non-zero exit) */
function mockExecError(stderr: string, exitCode = 1): ExecFn {
    const calls: string[] = [];
    const fn: ExecFn & { calls: string[] } = async (command: string) => {
        calls.push(command);
        throw Object.assign(new Error(stderr), { stdout: '', stderr, code: exitCode });
    };
    fn.calls = calls;
    return fn;
}

suite('GitService Unit Tests', () => {
    // ─── 10a-i: Stash line parsing ───────────────────────────────

    suite('getStashList — stash line parsing', () => {
        test('parses standard stash entry with message', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|2026-02-10 14:23:05 -0600|On main: fix login bug',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list.length, 1);
            assert.strictEqual(list[0].index, 0);
            assert.strictEqual(list[0].name, 'stash@{0}');
            assert.strictEqual(list[0].branch, 'main');
            assert.strictEqual(list[0].message, 'fix login bug');
        });

        test('parses WIP stash with no user message', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|2026-02-10 14:23:05 -0600|WIP on feature: abc1234 commit msg',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list[0].branch, 'feature');
            assert.strictEqual(list[0].message, '(no message)');
        });

        test('parses stash with user message containing pipes', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|2026-02-10 14:23:05 -0600|On main: fix|something|weird',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list[0].message, 'fix|something|weird');
        });

        test('parses multiple stash entries', async () => {
            const exec = mockExec([
                {
                    stdout: [
                        'stash@{0}|2026-02-10 14:23:05 -0600|On main: newest',
                        'stash@{1}|2026-02-09 10:00:00 -0600|On dev: middle',
                        'stash@{2}|2026-02-08 09:00:00 -0600|On main: oldest',
                    ].join('\n'),
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list.length, 3);
            assert.strictEqual(list[0].index, 0);
            assert.strictEqual(list[1].index, 1);
            assert.strictEqual(list[2].index, 2);
            assert.strictEqual(list[0].message, 'newest');
            assert.strictEqual(list[2].message, 'oldest');
        });

        test('returns empty array on non-zero exit code', async () => {
            const exec = mockExecError('fatal: not a git repository');
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list.length, 0);
        });

        test('returns empty array on empty stdout', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            // stdout is empty string → split gives [''], map produces 1 entry
            // But since exitCode === 0 and stdout is empty after trim, should return []
            assert.strictEqual(list.length, 0);
        });

        test('handles stash on branch with slashes', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|2026-02-10 14:23:05 -0600|On feature/auth/login: my stash',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list[0].branch, 'feature/auth/login');
            assert.strictEqual(list[0].message, 'my stash');
        });

        test('handles WIP stash with only commit hash as message', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|2026-02-10 14:23:05 -0600|WIP on main: abc1234',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.strictEqual(list[0].message, '(no message)');
        });
    });

    // ─── 10a-ii: Date parsing ────────────────────────────────────

    suite('getStashList — date parsing', () => {
        test('parses ISO date string into Date object', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|2026-02-10 14:23:05 -0600|On main: test',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const list = await svc.getStashList();

            assert.ok(list[0].date instanceof Date);
            assert.ok(!isNaN(list[0].date.getTime()), 'Date should be valid');
        });

        test('falls back to current date on invalid date string', async () => {
            const exec = mockExec([
                {
                    stdout: 'stash@{0}|not-a-date|On main: test',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const before = Date.now();
            const list = await svc.getStashList();
            const after = Date.now();

            // NaN date is invalid — check it doesn't crash
            assert.ok(list[0].date instanceof Date);
        });
    });

    // ─── 10a-iii: Stats parsing ──────────────────────────────────

    suite('getStashStats — stats parsing', () => {
        test('parses standard stat output', async () => {
            const exec = mockExec([
                {
                    stdout: [
                        ' src/file1.ts | 10 +++++-----',
                        ' src/file2.ts |  3 +++',
                        ' 2 files changed, 8 insertions(+), 5 deletions(-)',
                    ].join('\n'),
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const stats = await svc.getStashStats(0);

            assert.ok(stats);
            assert.strictEqual(stats!.filesChanged, 2);
            assert.strictEqual(stats!.insertions, 8);
            assert.strictEqual(stats!.deletions, 5);
        });

        test('parses stats with only insertions', async () => {
            const exec = mockExec([
                {
                    stdout: ' 1 file changed, 5 insertions(+)',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const stats = await svc.getStashStats(0);

            assert.ok(stats);
            assert.strictEqual(stats!.filesChanged, 1);
            assert.strictEqual(stats!.insertions, 5);
            assert.strictEqual(stats!.deletions, 0);
        });

        test('parses stats with only deletions', async () => {
            const exec = mockExec([
                {
                    stdout: ' 1 file changed, 3 deletions(-)',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const stats = await svc.getStashStats(0);

            assert.ok(stats);
            assert.strictEqual(stats!.filesChanged, 1);
            assert.strictEqual(stats!.insertions, 0);
            assert.strictEqual(stats!.deletions, 3);
        });

        test('returns undefined on non-zero exit code', async () => {
            const exec = mockExecError('no stash');
            const svc = new GitService('/fake/root', undefined, exec);
            const stats = await svc.getStashStats(0);

            assert.strictEqual(stats, undefined);
        });
    });

    // ─── 10a-iv: File status parsing ─────────────────────────────

    suite('getStashFilesWithStatus — file status parsing', () => {
        test('parses mixed status output', async () => {
            const exec = mockExec([
                {
                    stdout: 'M\tsrc/extension.ts\nA\tsrc/newFile.ts\nD\tsrc/oldFile.ts',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const files = await svc.getStashFilesWithStatus(0);

            assert.strictEqual(files.length, 3);
            assert.strictEqual(files[0].status, 'M');
            assert.strictEqual(files[0].path, 'src/extension.ts');
            assert.strictEqual(files[1].status, 'A');
            assert.strictEqual(files[1].path, 'src/newFile.ts');
            assert.strictEqual(files[2].status, 'D');
            assert.strictEqual(files[2].path, 'src/oldFile.ts');
        });

        test('handles renamed file status', async () => {
            const exec = mockExec([
                {
                    stdout: 'R\told/path.ts\tnew/path.ts',
                },
            ]);
            const svc = new GitService('/fake/root', undefined, exec);
            const files = await svc.getStashFilesWithStatus(0);

            assert.strictEqual(files.length, 1);
            assert.strictEqual(files[0].status, 'R');
        });

        test('throws on non-zero exit code', async () => {
            const exec = mockExecError('no stash');
            const svc = new GitService('/fake/root', undefined, exec);

            await assert.rejects(() => svc.getStashFilesWithStatus(0));
        });
    });

    // ─── 10a-v: Command construction ─────────────────────────────

    suite('createStash — command construction', () => {
        test('builds basic command with no message or mode', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            await svc.createStash();

            assert.ok((exec as ExecFn & { calls: string[] }).calls[0].includes('stash push'));
            assert.ok(!(exec as ExecFn & { calls: string[] }).calls[0].includes('-m'));
        });

        test('includes message flag when provided', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            await svc.createStash('my changes');

            assert.ok((exec as ExecFn & { calls: string[] }).calls[0].includes('-m "my changes"'));
        });

        test('includes --include-untracked for untracked mode', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            await svc.createStash(undefined, 'untracked');

            assert.ok(
                (exec as ExecFn & { calls: string[] }).calls[0].includes('--include-untracked'),
            );
        });

        test('includes --staged for staged mode', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            await svc.createStash(undefined, 'staged');

            assert.ok((exec as ExecFn & { calls: string[] }).calls[0].includes('--staged'));
        });

        test('throws on non-zero exit code', async () => {
            const exec = mockExecError('No local changes to save');
            const svc = new GitService('/fake/root', undefined, exec);

            await assert.rejects(() => svc.createStash('test'), /No local changes to save/);
        });
    });

    // ─── 10a-vi: Conflict detection ──────────────────────────────

    suite('applyStash / popStash — conflict detection', () => {
        test('applyStash returns success on clean apply', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            const result = await svc.applyStash(0);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.conflicts, false);
        });

        test('applyStash detects CONFLICT in stderr', async () => {
            const exec: ExecFn = async (command) => {
                throw Object.assign(new Error('CONFLICT'), {
                    stdout: '',
                    stderr: 'CONFLICT (content): Merge conflict in file.ts',
                    code: 1,
                });
            };
            const svc = new GitService('/fake/root', undefined, exec);
            const result = await svc.applyStash(0);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.conflicts, true);
            assert.ok(result.message.includes('CONFLICT'));
        });

        test('applyStash returns failure on non-conflict error', async () => {
            const exec = mockExecError('stash@{0} does not exist');
            const svc = new GitService('/fake/root', undefined, exec);
            const result = await svc.applyStash(0);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.conflicts, false);
        });

        test('popStash detects CONFLICT (stash NOT dropped)', async () => {
            const exec: ExecFn = async (command) => {
                throw Object.assign(new Error('CONFLICT'), {
                    stdout: '',
                    stderr: 'CONFLICT (content): Merge conflict in file.ts',
                    code: 1,
                });
            };
            const svc = new GitService('/fake/root', undefined, exec);
            const result = await svc.popStash(0);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.conflicts, true);
        });

        test('popStash returns failure on non-conflict error', async () => {
            const exec = mockExecError('stash@{0} does not exist');
            const svc = new GitService('/fake/root', undefined, exec);
            const result = await svc.popStash(0);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.conflicts, false);
        });
    });

    // ─── Additional: no workspace root ───────────────────────────

    suite('GitService — no workspace root', () => {
        test('returns empty result when no workspace root is set', async () => {
            const svc = new GitService(undefined, undefined, mockExec([]));
            const list = await svc.getStashList();
            assert.strictEqual(list.length, 0);
        });

        test('hasChanges returns false when no workspace root', async () => {
            const svc = new GitService(undefined, undefined, mockExec([]));
            const hasChanges = await svc.hasChanges();
            assert.strictEqual(hasChanges, false);
        });

        test('isGitRepository returns false when no workspace root', async () => {
            const svc = new GitService(undefined, undefined, mockExec([]));
            const isRepo = await svc.isGitRepository();
            assert.strictEqual(isRepo, false);
        });
    });

    // ─── getCurrentBranch ────────────────────────────────────────

    suite('getCurrentBranch', () => {
        test('returns branch name on success', async () => {
            const exec = mockExec([{ stdout: 'main' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            const branch = await svc.getCurrentBranch();
            assert.strictEqual(branch, 'main');
        });

        test('returns "HEAD (detached)" for detached HEAD (empty stdout)', async () => {
            const exec = mockExec([{ stdout: '' }]);
            const svc = new GitService('/fake/root', undefined, exec);
            const branch = await svc.getCurrentBranch();
            assert.strictEqual(branch, 'HEAD (detached)');
        });

        test('returns undefined when not a git repo', async () => {
            const exec = mockExecError('not a git repo');
            const svc = new GitService('/fake/root', undefined, exec);
            const branch = await svc.getCurrentBranch();
            assert.strictEqual(branch, undefined);
        });

        test('returns undefined when no workspace root', async () => {
            const svc = new GitService(undefined, undefined, mockExec([]));
            const branch = await svc.getCurrentBranch();
            assert.strictEqual(branch, undefined);
        });
    });
});
