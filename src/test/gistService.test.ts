import * as assert from 'assert';
import { GistService, GistNote, FetchFn } from '../gistService';

/**
 * Unit tests for GistService — uses injectable FetchFn to mock GitHub API.
 * No VS Code host or real network needed.
 *
 * We need a minimal AuthService mock that supplies tokens.
 */

// ─── Mocks ────────────────────────────────────────────────────────

/** Minimal AuthService mock */
function mockAuthService(token = 'ghp_testtoken123') {
    return {
        getToken: async () => token,
        isAuthenticated: async () => !!token,
        getSession: async () => null,
        signIn: async () => null,
        signOut: async () => {},
        onDidChangeAuthentication: () => ({ dispose: () => {} }),
        dispose: () => {},
    };
}

/** Minimal OutputChannel mock */
function mockOutputChannel() {
    const lines: string[] = [];
    return {
        appendLine: (line: string) => {
            lines.push(line);
        },
        lines,
        // Satisfy the interface enough for tests
        append: () => {},
        replace: () => {},
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {},
        name: 'MockOutput',
    };
}

/** Build a GitHub Gist API response for a Superprompt Forge note */
function makeGist(
    overrides: {
        id?: string;
        title?: string;
        content?: string;
        isPublic?: boolean;
        createdAt?: string;
        updatedAt?: string;
    } = {},
) {
    const title = overrides.title ?? 'Test Note';
    const content = overrides.content ?? '# Test Note\n\nHello world.';
    return {
        id: overrides.id ?? 'gist123',
        description: `[Superprompt Forge] ${title}`,
        public: overrides.isPublic ?? false,
        html_url: `https://gist.github.com/${overrides.id ?? 'gist123'}`,
        created_at: overrides.createdAt ?? '2026-02-10T14:00:00Z',
        updated_at: overrides.updatedAt ?? '2026-02-10T15:00:00Z',
        files: {
            '.superprompt-forge-note': { filename: '.superprompt-forge-note', content: '{"v":1}' },
            'Test-Note.md': { filename: 'Test-Note.md', content },
        },
    };
}

/** Create a mock fetch that returns a sequence of responses */
function mockFetch(
    responses: { status: number; body?: unknown; headers?: Record<string, string> }[],
): FetchFn & { calls: { url: string; init: RequestInit }[] } {
    let callIndex = 0;
    const calls: { url: string; init: RequestInit }[] = [];

    const fn = async (input: string | URL | Request, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, init: init ?? {} });
        const resp = responses[callIndex++];
        if (!resp) {
            throw new Error('mockFetch: no more responses');
        }
        return new Response(resp.body !== undefined ? JSON.stringify(resp.body) : null, {
            status: resp.status,
            headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Remaining': '100',
                ...resp.headers,
            },
        });
    };

    const result = fn as FetchFn & { calls: { url: string; init: RequestInit }[] };
    result.calls = calls;
    return result;
}

// ─── Helper ───────────────────────────────────────────────────────

function createService(fetchFn: FetchFn, token = 'ghp_testtoken123'): GistService {
    const auth = mockAuthService(token);
    const output = mockOutputChannel();
    // GistService constructor: (authService, outputChannel, fetchFn?)
    return new GistService(auth as any, output as any, fetchFn);
}

// ─── Tests ────────────────────────────────────────────────────────

suite('GistService Unit Tests', () => {
    // ─── listNotes ────────────────────────────────────────────────

    suite('listNotes', () => {
        test('returns empty array when no gists match marker', async () => {
            const fetch = mockFetch([{ status: 200, body: [] }]);
            const svc = createService(fetch);
            const notes = await svc.listNotes();
            assert.strictEqual(notes.length, 0);
        });

        test('parses Superprompt Forge notes from gist list', async () => {
            const gist1 = makeGist({ id: 'a1', title: 'First Note' });
            const gist2 = makeGist({ id: 'a2', title: 'Second Note', isPublic: true });
            // Non-superprompt-forge gist (no marker file)
            const regularGist = {
                id: 'other',
                description: 'Random',
                public: true,
                html_url: 'https://gist.github.com/other',
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
                files: { 'readme.md': { filename: 'readme.md', content: 'hi' } },
            };

            const fetch = mockFetch([{ status: 200, body: [gist1, regularGist, gist2] }]);
            const svc = createService(fetch);
            const notes = await svc.listNotes();

            assert.strictEqual(notes.length, 2);
            assert.strictEqual(notes[0].title, 'First Note');
            assert.strictEqual(notes[0].isPublic, false);
            assert.strictEqual(notes[1].title, 'Second Note');
            assert.strictEqual(notes[1].isPublic, true);
        });

        test('parses legacy [Workstash] notes alongside current notes', async () => {
            const currentGist = makeGist({ id: 'new1', title: 'New Note' });
            const legacyGist = {
                id: 'old1',
                description: '[Workstash] Legacy Note',
                public: false,
                html_url: 'https://gist.github.com/old1',
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-15T00:00:00Z',
                files: {
                    '.workstash-note': { filename: '.workstash-note', content: '{"v":1}' },
                    'Legacy-Note.md': { filename: 'Legacy-Note.md', content: '# Legacy' },
                },
            };

            const fetch = mockFetch([{ status: 200, body: [currentGist, legacyGist] }]);
            const svc = createService(fetch);
            const notes = await svc.listNotes();

            assert.strictEqual(notes.length, 2);
            assert.strictEqual(notes[0].title, 'New Note');
            assert.strictEqual(notes[1].title, 'Legacy Note');
            assert.strictEqual(notes[1].content, '# Legacy');
        });

        test('stops pagination when fewer than PER_PAGE results', async () => {
            const gists = Array.from({ length: 50 }, (_, i) =>
                makeGist({ id: `g${i}`, title: `Note ${i}` }),
            );
            const fetch = mockFetch([
                { status: 200, body: gists }, // < 100, so no second page
            ]);
            const svc = createService(fetch);
            const notes = await svc.listNotes();

            assert.strictEqual(notes.length, 50);
            assert.strictEqual(fetch.calls.length, 1);
        });

        test('sends auth header', async () => {
            const fetch = mockFetch([{ status: 200, body: [] }]);
            const svc = createService(fetch, 'ghp_mytoken');
            await svc.listNotes();

            const authHeader = (fetch.calls[0].init.headers as Record<string, string>)[
                'Authorization'
            ];
            assert.strictEqual(authHeader, 'Bearer ghp_mytoken');
        });
    });

    // ─── getNote ──────────────────────────────────────────────────

    suite('getNote', () => {
        test('fetches a single note by ID', async () => {
            const gist = makeGist({ id: 'abc', title: 'My Note', content: '# Hello' });
            const fetch = mockFetch([{ status: 200, body: gist }]);
            const svc = createService(fetch);
            const note = await svc.getNote('abc');

            assert.strictEqual(note.id, 'abc');
            assert.strictEqual(note.title, 'My Note');
            assert.strictEqual(note.content, '# Hello');
            assert.ok(fetch.calls[0].url.includes('/gists/abc'));
        });

        test('throws if gist is not a Superprompt Forge note', async () => {
            const regularGist = {
                id: 'xyz',
                description: 'Not Superprompt Forge',
                public: true,
                html_url: 'https://gist.github.com/xyz',
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
                files: { 'readme.md': { filename: 'readme.md', content: 'hi' } },
            };
            const fetch = mockFetch([{ status: 200, body: regularGist }]);
            const svc = createService(fetch);

            await assert.rejects(() => svc.getNote('xyz'), /not a Superprompt Forge note/i);
        });
    });

    // ─── createNote ───────────────────────────────────────────────

    suite('createNote', () => {
        test('sends correct payload', async () => {
            const createdGist = makeGist({ id: 'new1', title: 'Brand New' });
            const fetch = mockFetch([{ status: 201, body: createdGist }]);
            const svc = createService(fetch);
            const note = await svc.createNote('Brand New', '## Content', false);

            assert.strictEqual(note.id, 'new1');
            assert.strictEqual(note.title, 'Brand New');

            // Verify POST body
            const body = JSON.parse(fetch.calls[0].init.body as string);
            assert.strictEqual(body.description, '[Superprompt Forge] Brand New');
            assert.strictEqual(body.public, false);
            assert.ok(body.files['.superprompt-forge-note']);
            assert.ok(body.files['Brand-New.md']);
        });

        test('creates public gist when isPublic=true', async () => {
            const createdGist = makeGist({ id: 'pub1', title: 'Public Note', isPublic: true });
            const fetch = mockFetch([{ status: 201, body: createdGist }]);
            const svc = createService(fetch);
            await svc.createNote('Public Note', '', true);

            const body = JSON.parse(fetch.calls[0].init.body as string);
            assert.strictEqual(body.public, true);
        });

        test('uses default content with heading when content is empty', async () => {
            const createdGist = makeGist({ id: 'def1', title: 'Empty' });
            const fetch = mockFetch([{ status: 201, body: createdGist }]);
            const svc = createService(fetch);
            await svc.createNote('Empty', '', false);

            const body = JSON.parse(fetch.calls[0].init.body as string);
            const mdContent = body.files['Empty.md'].content;
            assert.ok(mdContent.startsWith('# Empty'));
        });
    });

    // ─── updateNote ───────────────────────────────────────────────

    suite('updateNote', () => {
        test('updates content and description', async () => {
            // First call: getNote fetches current state
            const current = makeGist({ id: 'u1', title: 'Old Title' });
            // Second call: PATCH update
            const updated = makeGist({ id: 'u1', title: 'New Title', content: '## Updated' });

            const fetch = mockFetch([
                { status: 200, body: current },
                { status: 200, body: updated },
            ]);
            const svc = createService(fetch);
            const note = await svc.updateNote('u1', 'New Title', '## Updated');

            assert.strictEqual(note.title, 'New Title');

            // Verify PATCH
            const patchBody = JSON.parse(fetch.calls[1].init.body as string);
            assert.strictEqual(patchBody.description, '[Superprompt Forge] New Title');
            assert.strictEqual(fetch.calls[1].init.method, 'PATCH');
        });

        test('deletes old file when title changes', async () => {
            const current = makeGist({ id: 'u2', title: 'Original' });
            const updated = makeGist({ id: 'u2', title: 'Renamed' });

            const fetch = mockFetch([
                { status: 200, body: current },
                { status: 200, body: updated },
            ]);
            const svc = createService(fetch);
            await svc.updateNote('u2', 'Renamed', 'content');

            const patchBody = JSON.parse(fetch.calls[1].init.body as string);
            // Old file should be set to null (delete)
            assert.strictEqual(patchBody.files['Original.md'], null);
            // New file should have content
            assert.ok(patchBody.files['Renamed.md']?.content);
        });
    });

    // ─── deleteNote ───────────────────────────────────────────────

    suite('deleteNote', () => {
        test('sends DELETE request', async () => {
            const fetch = mockFetch([{ status: 204 }]);
            const svc = createService(fetch);
            await svc.deleteNote('del1');

            assert.strictEqual(fetch.calls[0].init.method, 'DELETE');
            assert.ok(fetch.calls[0].url.includes('/gists/del1'));
        });
    });

    // ─── toggleVisibility ─────────────────────────────────────────

    suite('toggleVisibility', () => {
        test('deletes and recreates with opposite visibility', async () => {
            // 1. getNote → current (secret)
            const current = makeGist({ id: 'tv1', title: 'Toggle Me', isPublic: false });
            // 2. deleteNote → 204
            // 3. createNote → new gist (public)
            const recreated = makeGist({ id: 'tv1-new', title: 'Toggle Me', isPublic: true });

            const fetch = mockFetch([
                { status: 200, body: current }, // getNote
                { status: 204 }, // deleteNote
                { status: 201, body: recreated }, // createNote
            ]);
            const svc = createService(fetch);
            const note = await svc.toggleVisibility('tv1');

            assert.strictEqual(note.isPublic, true);
            assert.strictEqual(note.id, 'tv1-new');
            assert.strictEqual(fetch.calls.length, 3);
        });
    });

    // ─── toData ───────────────────────────────────────────────────

    suite('toData', () => {
        test('converts GistNote to GistNoteData with ISO date strings', () => {
            const note: GistNote = {
                id: 'td1',
                title: 'Data Test',
                content: '# Hello',
                isPublic: false,
                createdAt: new Date('2026-02-10T14:00:00Z'),
                updatedAt: new Date('2026-02-10T15:00:00Z'),
                htmlUrl: 'https://gist.github.com/td1',
                description: '[Superprompt Forge] Data Test',
                linkedRepo: null,
            };
            const data = GistService.toData(note);

            assert.strictEqual(data.id, 'td1');
            assert.strictEqual(data.title, 'Data Test');
            assert.strictEqual(data.createdAt, '2026-02-10T14:00:00.000Z');
            assert.strictEqual(data.updatedAt, '2026-02-10T15:00:00.000Z');
            assert.strictEqual(typeof data.createdAt, 'string');
        });
    });

    // ─── Error handling ───────────────────────────────────────────

    suite('error handling', () => {
        test('throws user-friendly error on 401', async () => {
            const fetch = mockFetch([{ status: 401, body: { message: 'Bad credentials' } }]);
            const svc = createService(fetch);

            await assert.rejects(() => svc.listNotes(), /sign in/i);
        });

        test('throws user-friendly error on 403 (rate limit)', async () => {
            const fetch = mockFetch([{ status: 403, body: { message: 'rate limit exceeded' } }]);
            const svc = createService(fetch);

            await assert.rejects(() => svc.listNotes(), /rate limit/i);
        });

        test('throws user-friendly error on 404', async () => {
            const fetch = mockFetch([{ status: 404, body: { message: 'Not Found' } }]);
            const svc = createService(fetch);

            await assert.rejects(() => svc.getNote('missing'), /not found/i);
        });

        test('throws on unauthenticated (no token)', async () => {
            const auth = mockAuthService('');
            // getToken returns empty string; service should check for falsy token
            const output = mockOutputChannel();
            const svc = new GistService(auth as any, output as any);

            await assert.rejects(() => svc.listNotes(), /not authenticated|sign in/i);
        });
    });
});
