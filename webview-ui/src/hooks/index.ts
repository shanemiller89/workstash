/**
 * Barrel export — all webview message handlers.
 *
 * Each handler is a plain function `(msg: Msg) => boolean`.
 * It returns `true` if it handled the message, `false` to pass to the next handler.
 *
 * The `handlerRegistry` array is iterated by App.tsx's `useEffect`
 * until one handler returns `true`.
 */

import { handleStashMessage } from './useStashMessages';
import { handleNotesMessage } from './useNotesMessages';
import { handlePRMessage } from './usePRMessages';
import { handleIssueMessage } from './useIssueMessages';
import { handleProjectMessage } from './useProjectMessages';
import { handleMattermostMessage } from './useMattermostMessages';
import { handleAIMessage } from './useAIMessages';
import { handleDriveMessage } from './useDriveMessages';
import { handleCalendarMessage } from './useCalendarMessages';
import { handleWikiMessage } from './useWikiMessages';
import { handleAppMessage } from './useAppMessages';
import { handleSettingsMessage } from './useSettingsMessages';

export {
    handleStashMessage,
    handleNotesMessage,
    handlePRMessage,
    handleIssueMessage,
    handleProjectMessage,
    handleMattermostMessage,
    handleAIMessage,
    handleDriveMessage,
    handleCalendarMessage,
    handleWikiMessage,
    handleAppMessage,
    handleSettingsMessage,
};

type Msg = { type: string; [key: string]: unknown };
type MessageHandler = (msg: Msg) => boolean;

/**
 * Ordered list of all message handlers. The dispatch loop in App.tsx
 * iterates this array and stops at the first handler that returns `true`.
 */
export const handlerRegistry: MessageHandler[] = [
    // App-level (repoContext) first — most frequent
    handleAppMessage,
    handleStashMessage,
    handleNotesMessage,
    handlePRMessage,
    handleIssueMessage,
    handleProjectMessage,
    handleMattermostMessage,
    handleAIMessage,
    handleDriveMessage,
    handleCalendarMessage,
    handleWikiMessage,
    handleSettingsMessage,
];
