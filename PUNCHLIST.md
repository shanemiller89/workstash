# Superprompt Forge — QoL, Optimization & Hardening Punch List

> **v0.3.0** — Quality-of-Life improvements, performance optimizations, code health, and UX polish.
> ✅ = done, 🔲 = todo. Check off items as they are completed.
>
> **Guiding principles:**
>
> - No new features — harden and polish existing ones
> - Consistency: every list view, store, and handler should follow the same patterns
> - Performance: eliminate unnecessary renders, parallelize I/O, bound unbounded state
> - Code health: decompose monoliths, deduplicate, type-narrow, modernize Tailwind

---

## 1. 🏗️ Decompose `stashPanel.ts` (3,859 lines → domain handlers)

> Extract the ~2,000-line `_handleMessage()` switch into domain-specific handler modules. Each handler receives a shared context object and owns its own message types.

- [ ] **1a. Define `PanelContext` interface**
    - Shared type carrying `panel`, `extensionUri`, `gitService`, `outputChannel`, `authService`, `gistService`, `prService`, `issueService`, `mattermostService`, `projectService`, `driveService`, `calendarService`, `wikiService`, and helper methods (`_postMessage`, `_refresh`, `_getWebviewContent`, etc.)
    - 📁 New file: `src/panelContext.ts`

- [ ] **1b. Extract stash message handlers**
    - Move all stash-related cases (`apply`, `pop`, `drop`, `create`, `showFile`, `getFileDiff`, `refresh`, `clear`, `createStashInline`) into `src/handlers/stashHandlers.ts`
    - Export a single `handleStashMessage(ctx, message)` function
    - 📁 `src/handlers/stashHandlers.ts`

- [ ] **1c. Extract notes message handlers**
    - Move all notes-related cases (`notesReady`, `loadNotes`, `loadNote`, `createNote`, `saveNote`, `deleteNote`, `toggleNoteVisibility`, `copyNoteLink`, `signIn`, `signOut`) into `src/handlers/notesHandlers.ts`
    - 📁 `src/handlers/notesHandlers.ts`

- [ ] **1d. Extract PR message handlers**
    - Move PR cases (`loadPRs`, `loadPR`, `loadPRComments`, `addPRComment`, `loadPRFiles`, `prReady`) into `src/handlers/prHandlers.ts`
    - 📁 `src/handlers/prHandlers.ts`

- [ ] **1e. Extract issue message handlers**
    - Move issue cases into `src/handlers/issueHandlers.ts`
    - 📁 `src/handlers/issueHandlers.ts`

- [ ] **1f. Extract Mattermost message handlers**
    - Move Mattermost cases (channels, posts, threads, DMs, reactions, typing, WebSocket) into `src/handlers/mattermostHandlers.ts`
    - 📁 `src/handlers/mattermostHandlers.ts`

- [ ] **1g. Extract project message handlers**
    - Move project cases into `src/handlers/projectHandlers.ts`
    - 📁 `src/handlers/projectHandlers.ts`

- [ ] **1h. Extract Drive/Calendar/Wiki message handlers**
    - Move Drive, Calendar, and Wiki cases into `src/handlers/driveHandlers.ts`, `src/handlers/calendarHandlers.ts`, `src/handlers/wikiHandlers.ts`
    - 📁 `src/handlers/driveHandlers.ts`, `src/handlers/calendarHandlers.ts`, `src/handlers/wikiHandlers.ts`

- [ ] **1i. Extract AI message handlers**
    - Move AI cases (`ai.summarize`, `ai.chat`, `ai.agent`, `ai.cancelAgent`, `ai.getModels`, `ai.setModel`, `ai.configureGeminiKey`) into `src/handlers/aiHandlers.ts`
    - 📁 `src/handlers/aiHandlers.ts`

- [ ] **1j. Wire handlers into `stashPanel.ts`**
    - Replace the monolithic switch with a handler registry/dispatch:
      ```ts
      const handlers = [handleStashMessage, handleNotesMessage, ...];
      for (const handler of handlers) {
          if (await handler(ctx, message)) return;
      }
      ```
    - `stashPanel.ts` should shrink to ~300 lines (class shell, lifecycle, HTML generation)
    - 📁 `src/stashPanel.ts`

---

## 2. 🏗️ Decompose `App.tsx` message handler (~900 lines → per-domain dispatchers)

> Same pattern as §1 but for the webview side. Split the `useEffect` message handler into composable hooks.

- [ ] **2a. Create `useStashMessages` hook**
    - Handles `stashList`, `fileDiff`, stash operation result messages
    - Dispatches to `useStashStore`
    - 📁 `webview-ui/src/hooks/useStashMessages.ts`

- [ ] **2b. Create `useNotesMessages` hook**
    - Handles `notesData`, `noteContent`, `noteSaved`, `noteCreated`, `noteDeleted`, `authStatus`, `notesLoading`, `notesError`
    - Dispatches to `useNotesStore`
    - 📁 `webview-ui/src/hooks/useNotesMessages.ts`

- [ ] **2c. Create `usePRMessages` hook**
    - 📁 `webview-ui/src/hooks/usePRMessages.ts`

- [ ] **2d. Create `useIssueMessages` hook**
    - 📁 `webview-ui/src/hooks/useIssueMessages.ts`

- [ ] **2e. Create `useMattermostMessages` hook**
    - 📁 `webview-ui/src/hooks/useMattermostMessages.ts`

- [ ] **2f. Create `useProjectMessages` hook**
    - 📁 `webview-ui/src/hooks/useProjectMessages.ts`

- [ ] **2g. Create `useDriveMessages`, `useCalendarMessages`, `useWikiMessages` hooks**
    - 📁 `webview-ui/src/hooks/useDriveMessages.ts`, `useCalendarMessages.ts`, `useWikiMessages.ts`

- [ ] **2h. Create `useAIMessages` hook**
    - 📁 `webview-ui/src/hooks/useAIMessages.ts`

- [ ] **2i. Compose all hooks in `App.tsx`**
    - `App.tsx` calls each `use*Messages()` hook, which internally calls `onMessage()` and handles its own subset
    - App.tsx should shrink to ~200 lines (layout, tab routing, hook composition)
    - 📁 `webview-ui/src/App.tsx`

---

## 3. 🔗 Consolidate `StashPanel.createOrShow` — Options Bag Pattern

> The 12-parameter factory method is called 6 times in `extension.ts` with identical args.

- [x] **3a. Define `PanelServices` interface**
    - ```ts
      interface PanelServices {
          gitService: GitService;
          outputChannel: vscode.OutputChannel;
          authService?: AuthService;
          gistService?: GistService;
          prService?: PrService;
          issueService?: IssueService;
          mattermostService?: MattermostService;
          projectService?: ProjectService;
          driveService?: GoogleDriveService;
          calendarService?: GoogleCalendarService;
          wikiService?: WikiService;
      }
      ```
    - 📁 `src/panelContext.ts` (or inline in `stashPanel.ts`)

- [x] **3b. Refactor `createOrShow` signature**
    - Change to `createOrShow(extensionUri: vscode.Uri, services: PanelServices): StashPanel`
    - 📁 `src/stashPanel.ts`

- [x] **3c. Create `services` constant in `extension.ts`**
    - Build the services bag once, pass it to all 6 call sites
    - Reduces 6 × 12-arg calls to 6 × 2-arg calls referencing a shared `services` local
    - 📁 `src/extension.ts`

---

## 4. 🔄 Deduplicate Shared Code

> Three categories of duplicated logic need single-sourcing.

### 4A. `formatRelativeTime` (3 copies → 1)

- [x] **4a-i. Audit all copies**
    - `src/utils.ts` (canonical)
    - `webview-ui/src/components/NotesList.tsx` → `formatRelativeTimeSimple()` (line 284)
    - `src/stashPanel.ts` → if a private `_formatRelativeTime()` copy exists
    - Identify differences in logic (if any)
    - 📁 Audit only

- [x] **4a-ii. Create shared `formatRelativeTime` for webview**
    - New file: `webview-ui/src/lib/formatRelativeTime.ts` exporting the canonical implementation
    - Update `NotesList.tsx` to import from `@/lib/formatRelativeTime`
    - Update any other webview consumers
    - 📁 `webview-ui/src/lib/formatRelativeTime.ts`, `webview-ui/src/components/NotesList.tsx`

- [x] **4a-iii. Remove private copy from `stashPanel.ts` (if exists)**
    - Use the `src/utils.ts` import (already imported)
    - 📁 `src/stashPanel.ts`

### 4B. Agent Templates (2 copies → 1 source of truth)

- [ ] **4b-i. Single-source agent templates in `aiService.ts`**
    - Backend `AGENT_TEMPLATES` is the source of truth
    - Add a new message type `'ai.getTemplates'` that sends templates to the webview
    - 📁 `src/aiService.ts`, `src/handlers/aiHandlers.ts`

- [ ] **4b-ii. Remove hardcoded templates from `AgentTab.tsx`**
    - `AgentTab.tsx` receives templates from extension via message, stores in `aiStore.ts`
    - The `AGENT_TEMPLATES` array and `DEFAULT_SYSTEM_PROMPTS` map in `AgentTab.tsx` become dynamic data from the store
    - 📁 `webview-ui/src/components/AgentTab.tsx`, `webview-ui/src/aiStore.ts`

### 4C. Google OAuth Credential Prompting (3 copies → 1)

- [x] **4c-i. Extract `ensureGoogleCredentials()` in extension**
    - Shared helper function used by:
      - `extension.ts` → `superprompt-forge.drive.signIn` command
      - `stashPanel.ts` → Drive sign-in handler
      - `stashPanel.ts` → Calendar sign-in handler
    - 📁 `src/utils.ts` (or new `src/googleUtils.ts`)

- [x] **4c-ii. Update all 3 call sites**
    - Replace inline credential prompting with the shared helper
    - 📁 `src/extension.ts`, `src/stashPanel.ts` (2 places)

### 4D. Gemini Model List (2 copies → 1)

- [ ] **4d-i. Single-source Gemini model definitions**
    - Define `GEMINI_MODELS` array in `src/geminiService.ts` and export it
    - Import in `src/aiService.ts` instead of re-declaring
    - 📁 `src/geminiService.ts`, `src/aiService.ts`

### 4E. Error Message Extraction (4 patterns → 1 utility)

- [x] **4e-i. Create `extractErrorMessage(e: unknown): string` utility**
    - Canonical pattern: `e instanceof Error ? e.message : String(e)`
    - 📁 `src/utils.ts`

- [x] **4e-ii. Replace all inline error extraction across `stashPanel.ts` and `extension.ts`**
    - Replace `e instanceof Error ? e.message : 'Unknown error'`
    - Replace `String(e)`
    - Replace `(e as Error).message`
    - Replace template literal fallback patterns
    - 📁 `src/stashPanel.ts`, `src/extension.ts`

---

## 5. ⚡ Performance — Zustand Selective Subscriptions

> Prevent unnecessary re-renders by switching from object destructuring to selector-based subscriptions.

- [ ] **5a. Fix `StashCard.tsx` — selective subscriptions**
    - Replace:
      ```ts
      const { expandedIndices, toggleExpanded, selectStash, selectedStashIndex } = useStashStore();
      ```
    - With individual selectors:
      ```ts
      const expandedIndices = useStashStore((s) => s.expandedIndices);
      const toggleExpanded = useStashStore((s) => s.toggleExpanded);
      const selectStash = useStashStore((s) => s.selectStash);
      const selectedStashIndex = useStashStore((s) => s.selectedStashIndex);
      ```
    - 📁 `webview-ui/src/components/StashCard.tsx`

- [ ] **5b. Audit all components for non-selective subscriptions**
    - Search all `.tsx` files for `} = use*Store()` destructuring pattern
    - Convert each to selector-based subscriptions
    - Document which components were updated
    - 📁 All `webview-ui/src/components/*.tsx`

- [ ] **5c. Memoize derived selectors in stores**
    - Ensure `filteredStashes()`, `filteredNotes()`, and similar computed selectors only recompute when their dependencies change
    - Use `useMemo` at the component level or Zustand's `useShallow` where appropriate
    - 📁 `webview-ui/src/store.ts`, `webview-ui/src/notesStore.ts`, `webview-ui/src/prStore.ts`

---

## 6. ⚡ Performance — AI Request Management

> Add AbortController-based cancellation and request deduplication for AI operations.

- [ ] **6a. Add `AbortController` to AI summary requests**
    - Store a per-tab `AbortController` in `AiService`
    - Abort previous request when a new summary is triggered for the same tab
    - Pass `signal` to `fetch()` (Gemini) or `CancellationToken` (Copilot)
    - 📁 `src/aiService.ts`, `src/geminiService.ts`

- [ ] **6b. Add `AbortController` to AI chat requests**
    - Store a single chat `AbortController`
    - Abort in-flight request when user sends a new message or closes chat
    - 📁 `src/aiService.ts`, `src/geminiService.ts`

- [ ] **6c. Add `AbortController` to agent analysis**
    - Already has a `CancellationToken` parameter — ensure it's wired to Gemini's `fetch` signal
    - 📁 `src/aiService.ts`, `src/geminiService.ts`

- [ ] **6d. Parallelize `_gatherAllTabContext()`**
    - Replace sequential tab-by-tab fetching with `Promise.all()` for independent data sources
    - Group: stashes (git CLI) | PRs + Issues + Projects (GitHub API, can share auth) | Notes (Gist API) | Mattermost (REST) | Drive + Calendar (Google API) | Wiki (GitHub API)
    - 📁 `src/stashPanel.ts` (or `src/handlers/aiHandlers.ts` after §1i)

- [ ] **6e. Bound chat message history**
    - Add `MAX_CHAT_MESSAGES = 200` constant
    - When adding a new message, trim oldest messages beyond the limit
    - 📁 `webview-ui/src/aiStore.ts`

---

## 7. ⌨️ Keyboard Navigation Parity

> Extend the roving tabindex pattern from `StashList` to all list views.

- [ ] **7a. Extract `useRovingTabIndex` hook**
    - Generalize the keyboard navigation logic from `StashList.tsx` into a reusable hook
    - API: `useRovingTabIndex({ itemCount, onSelect, onAction? })` → `{ activeIndex, containerProps, getItemProps }`
    - Supports: Arrow Up/Down, Home/End, Enter/Space, Escape
    - 📁 `webview-ui/src/hooks/useRovingTabIndex.ts`

- [ ] **7b. Apply to `PRList.tsx`**
    - Add keyboard navigation with `useRovingTabIndex`
    - Enter → open PR detail
    - 📁 `webview-ui/src/components/PRList.tsx`

- [ ] **7c. Apply to `IssueList.tsx`**
    - Same pattern, Enter → open issue detail
    - 📁 `webview-ui/src/components/IssueList.tsx`

- [ ] **7d. Apply to `NotesList.tsx`**
    - Same pattern, Enter → select note for editing
    - 📁 `webview-ui/src/components/NotesList.tsx`

- [ ] **7e. Apply to `MattermostChannelList.tsx`**
    - Same pattern, Enter → open channel
    - 📁 `webview-ui/src/components/MattermostChannelList.tsx`

- [ ] **7f. Apply to `ProjectList.tsx`**
    - Same pattern, Enter → open project item detail
    - 📁 `webview-ui/src/components/ProjectList.tsx`

- [ ] **7g. Apply to `DriveFileList.tsx`**
    - Same pattern, Enter → open file detail / navigate into folder
    - 📁 `webview-ui/src/components/DriveFileList.tsx`

- [ ] **7h. Document keyboard shortcuts**
    - Add a keyboard shortcut help section to `SettingsTab.tsx`
    - Show all discoverable shortcuts: `a`/`p`/`d` (stash), `Enter`/`Escape` (all lists)
    - Add tooltip on StashCard hover showing shortcuts
    - 📁 `webview-ui/src/components/SettingsTab.tsx`, `webview-ui/src/components/StashCard.tsx`

---

## 8. 🛡️ Error States for List Views

> Add consistent error state UI to all list components that fetch data.

- [ ] **8a. Create `ErrorState` component**
    - Reusable component: icon + error message + optional retry button
    - Props: `{ message: string; onRetry?: () => void }`
    - Uses shadcn/ui `Button`, VS Code theme colors
    - 📁 `webview-ui/src/components/ErrorState.tsx`

- [ ] **8b. Add `error` field to relevant stores**
    - Add `error: string | null` + `setError()` + `clearError()` to:
      - `prStore.ts`
      - `issueStore.ts`
      - `projectStore.ts`
      - `driveStore.ts`
      - `calendarStore.ts`
      - `wikiStore.ts`
    - (notesStore and mattermostStore may already have error handling — verify)
    - 📁 6 store files

- [ ] **8c. Wire error messages from extension to stores**
    - Ensure each domain handler sends `{ type: 'domainError', message: '...' }` on failure
    - Ensure webview message hooks (§2) dispatch to the correct store's `setError()`
    - 📁 Extension handlers (§1) + webview hooks (§2)

- [ ] **8d. Render `ErrorState` in list views**
    - Add error state rendering to:
      - `PRList.tsx` — with "Retry" calling `postMessage('loadPRs')`
      - `IssueList.tsx` — with "Retry" calling `postMessage('loadIssues')`
      - `ProjectList.tsx` — with retry
      - `DriveFileList.tsx` — with retry
      - `CalendarTab.tsx` — with retry
      - `WikiTab.tsx` — with retry
    - Error state shown between loading and empty states in the render priority
    - 📁 6 component files

---

## 9. 🗂️ Tab Organization — Grouping & Overflow

> Address the 9+ tab bar crowding issue for both webview tabs and sidebar tree views.

### 9A. Webview Tab Bar Improvements

- [ ] **9a-i. Group related tabs**
    - Implement tab groups with collapsible grouping:
      - **GitHub**: PRs, Issues, Projects, Wiki
      - **Workspace**: Stashes, Notes
      - **Google**: Drive, Calendar
      - **Team**: Mattermost (Chat)
      - **AI**: Agent
    - Each group has a dropdown that expands on click, showing child tabs
    - Active child tab's label shows in the group button
    - 📁 `webview-ui/src/components/TabBar.tsx`

- [ ] **9a-ii. Tab overflow menu**
    - When viewport is narrow, overflow tabs collapse into a "More…" dropdown menu
    - Uses shadcn `DropdownMenu` component
    - Most recently used tabs stay visible, least used overflow
    - 📁 `webview-ui/src/components/TabBar.tsx`

- [ ] **9a-iii. Persist tab order / pinned tabs**
    - Users can pin frequently used tabs to always be visible
    - Store pinned tab list in `appStore.ts`, persisted via `vscode.setState`
    - 📁 `webview-ui/src/appStore.ts`, `webview-ui/src/components/TabBar.tsx`

### 9B. Sidebar Tree View Organization

- [ ] **9b-i. Explore collapsible sidebar sections**
    - VS Code sidebar views already support `visibility: 'collapsed'` — verify all views set sensible defaults
    - Consider grouping sidebar views:
      - GitHub section: Stashes, PRs, Issues, Projects
      - Services section: Mattermost, Drive
    - Test with `viewsContainers` sub-grouping if supported
    - 📁 `package.json`

- [ ] **9b-ii. Add view visibility toggle commands**
    - Commands to show/hide specific sidebar sections
    - E.g., `superprompt-forge.toggleMattermostView`, `superprompt-forge.toggleDriveView`
    - Users can declutter sidebar by hiding features they don't use
    - 📁 `package.json`, `src/extension.ts`

---

## 10. 🎨 Tailwind v4 Modernization

> Bulk-update deprecated Tailwind utility classes to v4 equivalents.

- [x] **10a. `flex-shrink-0` → `shrink-0`**
    - ~100 instances across 20+ component files
    - Automated find-and-replace within `className` strings
    - 📁 All `webview-ui/src/components/*.tsx`

- [x] **10b. `flex-grow` → `grow`, `flex-grow-0` → `grow-0`**
    - Scan and replace all instances
    - 📁 All `webview-ui/src/components/*.tsx`

- [x] **10c. `overflow-hidden` → `overflow-clip` (where appropriate)**
    - Only replace where clipping behavior is desired (not where scrollable overflow is needed)
    - Review each usage contextually — some `overflow-hidden` is intentional for scrollable containers
    - 📁 Selective replacement

- [ ] **10d. Arbitrary value consolidation**
    - Replace `w-[280px]` → `w-70` where Tailwind v4 has standard spacing
    - Replace `text-[11px]` → `text-xs` or keep if intentional sub-scale sizing
    - Review on case-by-case basis — don't over-normalize if specific sizes are deliberate
    - 📁 Selective replacement

- [ ] **10e. Verify zero lint warnings after changes**
    - Run Tailwind CSS linting / build to confirm all warnings resolved
    - 📁 Verification only

---

## 11. 🔒 TypeScript Strictness — Eliminate `any`

> Replace all 18 `any` usages with proper types.

### 11A. `projectService.ts` — GraphQL Response Types (11 instances)

- [ ] **11a-i. Define `GraphQLProjectResponse` interface**
    - Type the raw response from GitHub Projects V2 GraphQL API
    - Cover `project.fields`, `project.views`, `project.items` nodes
    - 📁 `src/projectService.ts`

- [ ] **11a-ii. Replace `any` in `_parseProject()` and `_parseProjectItem()`**
    - Use the new typed interfaces instead of `any`
    - Remove all `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments
    - 📁 `src/projectService.ts`

### 11B. `extension.ts` — Catch Clauses (3 instances)

- [x] **11b-i. Replace `catch (error: any)` with `catch (error: unknown)`**
    - Lines 606, 629, 727 — use `extractErrorMessage()` utility from §4e
    - 📁 `src/extension.ts`

### 11C. Test Files (4 instances)

- [ ] **11c-i. Replace `as any` mock casts with proper mock types**
    - Create a `MockAuthService` and `MockOutputChannel` type for tests
    - Replace `auth as any` with `auth as MockAuthService`
    - 📁 `src/test/gistService.test.ts`

---

## 12. 🏷️ Fix Missing AI Tab Labels

> `_buildSummaryPrompt()` in `aiService.ts` is missing labels for `drive`, `calendar`, `wiki`.

- [x] **12a. Add missing tab labels**
    - Add to `tabLabels` map in `_buildSummaryPrompt()`:
      - `drive` → `'Google Drive'`
      - `calendar` → `'Google Calendar'`
      - `wiki` → `'Wiki'`
    - 📁 `src/aiService.ts`

- [x] **12b. Verify `stashes` label exists**
    - Confirm `stashes` → `'Git Stashes'` is present (it is)
    - 📁 Verification only

---

## 13. 📐 Summary Pane — Make Resizable

> The summary pane is fixed at 280px. Make it resizable using `react-resizable-panels` (already a dependency).

- [ ] **13a. Replace fixed-width `<div>` with `<PanelGroup>` + `<Panel>`**
    - In `TabWithSummary.tsx`: wrap content + summary in a resizable panel group
    - Default summary width: 280px, min: 200px, max: 400px
    - Drag handle between content and summary pane
    - 📁 `webview-ui/src/components/TabWithSummary.tsx`

- [ ] **13b. Persist summary pane width**
    - Store width in `aiStore.ts` → `summaryPaneWidth: number`
    - Save/restore via `vscode.setState` / `vscode.getState`
    - 📁 `webview-ui/src/aiStore.ts`, `webview-ui/src/components/TabWithSummary.tsx`

---

## 14. 🔧 `FloatingChat` — Extract `useDraggable` Hook

> The ~100 lines of manual drag/resize logic in `FloatingChat.tsx` should be a reusable hook.

- [ ] **14a. Extract `useDraggable` hook**
    - API: `useDraggable({ initialPosition, initialSize, minSize?, maxSize?, onPositionChange?, onSizeChange? })`
    - Returns: `{ position, size, dragHandleProps, resizeHandleProps }`
    - Handles `mousedown`/`mousemove`/`mouseup` with proper cleanup
    - 📁 `webview-ui/src/hooks/useDraggable.ts`

- [ ] **14b. Refactor `FloatingChat.tsx` to use `useDraggable`**
    - Replace inline mouse event handling with the hook
    - Reduces FloatingChat by ~80 lines
    - 📁 `webview-ui/src/components/FloatingChat.tsx`

- [ ] **14c. Consider reusing for `AgentTab` results pane resize**
    - `AgentTab.tsx` has a similar manual resize handle for the results pane
    - Evaluate if `useDraggable` (resize-only mode) can replace it
    - 📁 `webview-ui/src/components/AgentTab.tsx`

---

## 15. 🧹 Remaining Code Quality

> Miscellaneous cleanup items.

- [ ] **15a. Implement PR filter enhancement (TODO in codebase)**
    - `src/prProvider.ts` line 10: `// TODO: Add 'assigned' | 'review-requested' filters`
    - Add filter options for PRs where the user is assigned or review is requested
    - 📁 `src/prProvider.ts`, `src/prService.ts`, `webview-ui/src/components/PRList.tsx`

- [ ] **15b. Add `filteredByState` to `projectStore.ts`**
    - `filteredItems()` currently doesn't filter by `stateFilter` in the store — it's applied independently in views
    - Consolidate: add `stateFilter` into the store-level `filteredItems()` derived selector for consistency
    - 📁 `webview-ui/src/projectStore.ts`

- [ ] **15c. Remove duplicate `SettingsTab` message listener**
    - `SettingsTab.tsx` line ~138 adds its own `window.addEventListener('message', ...)` for `settingsData`
    - This duplicates the main `App.tsx` handler — consolidate into a single listener path
    - 📁 `webview-ui/src/components/SettingsTab.tsx`

- [ ] **15d. Document `Map`/`Set` usage in stores**
    - `store.ts` uses `Map` for `fileDiffs` and `Set` for `expandedIndices` / `fileDiffLoading`
    - These are not JSON-serializable (blocks Zustand devtools/persist middleware)
    - Add a code comment documenting this intentional choice, or migrate to `Record<string, T>` / `string[]`
    - 📁 `webview-ui/src/store.ts`

---

## 16. 🧪 Testing Updates

> Ensure new code is tested and existing tests still pass.

- [ ] **16a. Unit test handler modules (§1)**
    - Test each extracted handler function in isolation
    - Mock `PanelContext` with service stubs
    - 📁 `src/test/handlers/*.test.ts`

- [ ] **16b. Verify existing tests pass after refactors**
    - Run full test suite after §1–§4 changes
    - Fix any broken imports or mocking patterns
    - 📁 `src/test/*.test.ts`

- [ ] **16c. Add keyboard navigation tests**
    - Test `useRovingTabIndex` hook behavior
    - 📁 `webview-ui/src/hooks/__tests__/useRovingTabIndex.test.ts` (if test infra exists for webview)

---

## 17. 📦 Build & Release Verification

- [ ] **17a. `npm run compile` clean**
    - Zero TypeScript errors after all changes
    - 📁 Verification only

- [ ] **17b. `tsc --noEmit` for both `src/` and `webview-ui/`**
    - Zero errors in both tsconfig scopes
    - 📁 Verification only

- [ ] **17c. Tailwind build with zero warnings**
    - Verify after §10 changes
    - 📁 Verification only

- [ ] **17d. Bundle size check**
    - Compare `dist/` bundle sizes before and after
    - Ensure no regressions from new hook files / utilities
    - 📁 Verification only

- [ ] **17e. Update CHANGELOG.md**
    - Add v0.3.0 entry covering all QoL/optimization work
    - 📁 `CHANGELOG.md`

---

## Progress Summary

| Section                              | Sub-tasks | Done | Remaining |
|--------------------------------------|-----------|------|-----------|
| 1. Decompose `stashPanel.ts`        | 10        | 0    | 10        |
| 2. Decompose `App.tsx`              | 9         | 0    | 9         |
| 3. `createOrShow` Options Bag       | 3         | 0    | 3         |
| 4. Deduplicate Shared Code          | 10        | 0    | 10        |
| 5. Zustand Selective Subscriptions   | 3         | 0    | 3         |
| 6. AI Request Management            | 5         | 0    | 5         |
| 7. Keyboard Navigation Parity       | 8         | 0    | 8         |
| 8. Error States for List Views      | 4         | 0    | 4         |
| 9. Tab Organization                 | 5         | 0    | 5         |
| 10. Tailwind v4 Modernization       | 5         | 0    | 5         |
| 11. Eliminate `any`                  | 4         | 0    | 4         |
| 12. Fix Missing AI Tab Labels       | 2         | 0    | 2         |
| 13. Summary Pane Resizable          | 2         | 0    | 2         |
| 14. Extract `useDraggable`          | 3         | 0    | 3         |
| 15. Remaining Code Quality          | 4         | 0    | 4         |
| 16. Testing Updates                 | 3         | 0    | 3         |
| 17. Build & Release Verification    | 5         | 0    | 5         |
| **Total**                           | **85**    | **0**| **85**    |

---

## Suggested Implementation Order

```
Phase 1 — Foundation (do first, enables everything else):
  §3 (options bag) → §4e (error utility) → §1 (decompose stashPanel) → §2 (decompose App.tsx)

Phase 2 — Deduplication & Typing (safe, mechanical):
  §4a–d (dedup) → §11 (eliminate any) → §12 (AI tab labels)

Phase 3 — Performance (measurable improvements):
  §5 (selective subscriptions) → §6 (AI request management)

Phase 4 — UX Polish (user-visible improvements):
  §7 (keyboard nav) → §8 (error states) → §9 (tab organization) → §13 (resizable summary) → §14 (useDraggable)

Phase 5 — Cleanup & Ship:
  §10 (Tailwind) → §15 (misc quality) → §16 (testing) → §17 (build & release)
```

---

## New File Inventory

```
src/
├── panelContext.ts               # PanelContext interface + PanelServices type
├── handlers/
│   ├── stashHandlers.ts          # Stash message handlers
│   ├── notesHandlers.ts          # Notes message handlers
│   ├── prHandlers.ts             # PR message handlers
│   ├── issueHandlers.ts          # Issue message handlers
│   ├── mattermostHandlers.ts     # Mattermost message handlers
│   ├── projectHandlers.ts        # Project message handlers
│   ├── driveHandlers.ts          # Drive message handlers
│   ├── calendarHandlers.ts       # Calendar message handlers
│   ├── wikiHandlers.ts           # Wiki message handlers
│   └── aiHandlers.ts             # AI message handlers

webview-ui/src/
├── hooks/
│   ├── useStashMessages.ts       # Stash webview message handler hook
│   ├── useNotesMessages.ts       # Notes message handler hook
│   ├── usePRMessages.ts          # PR message handler hook
│   ├── useIssueMessages.ts       # Issue message handler hook
│   ├── useMattermostMessages.ts  # Mattermost message handler hook
│   ├── useProjectMessages.ts     # Project message handler hook
│   ├── useDriveMessages.ts       # Drive message handler hook
│   ├── useCalendarMessages.ts    # Calendar message handler hook
│   ├── useWikiMessages.ts        # Wiki message handler hook
│   ├── useAIMessages.ts          # AI message handler hook
│   ├── useRovingTabIndex.ts      # Reusable keyboard navigation hook
│   └── useDraggable.ts           # Reusable drag/resize hook
├── lib/
│   └── formatRelativeTime.ts     # Shared relative time formatter
└── components/
    └── ErrorState.tsx             # Reusable error state component
```
