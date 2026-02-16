// Barrel export for all domain message handlers.
// The `handlerRegistry` is an ordered array — the dispatcher tries each
// handler until one returns `true`.

export { handleStashMessage } from './stashHandlers';
export { handleNotesMessage } from './notesHandlers';
export { handlePrMessage } from './prHandlers';
export { handleIssueMessage } from './issueHandlers';
export { handleProjectMessage } from './projectHandlers';
export { handleMattermostMessage } from './mattermostHandlers';
export { handleAiMessage } from './aiHandlers';
export { handleSettingsMessage } from './settingsHandlers';
export { handleDriveMessage } from './driveHandlers';
export { handleCalendarMessage } from './calendarHandlers';
export { handleWikiMessage } from './wikiHandlers';

export type { HandlerContext, WebviewMessage, MessageHandler } from './types';

import type { MessageHandler } from './types';
import { handleStashMessage } from './stashHandlers';
import { handleNotesMessage } from './notesHandlers';
import { handlePrMessage } from './prHandlers';
import { handleIssueMessage } from './issueHandlers';
import { handleProjectMessage } from './projectHandlers';
import { handleMattermostMessage } from './mattermostHandlers';
import { handleAiMessage } from './aiHandlers';
import { handleSettingsMessage } from './settingsHandlers';
import { handleDriveMessage } from './driveHandlers';
import { handleCalendarMessage } from './calendarHandlers';
import { handleWikiMessage } from './wikiHandlers';

/**
 * Ordered list of all domain handlers.
 * The dispatcher iterates through this list and stops at the first handler
 * that returns `true`.
 */
export const handlerRegistry: MessageHandler[] = [
    handleStashMessage,
    handleNotesMessage,
    handlePrMessage,
    handleIssueMessage,
    handleProjectMessage,
    handleMattermostMessage,
    handleAiMessage,
    handleSettingsMessage,
    handleDriveMessage,
    handleCalendarMessage,
    handleWikiMessage,
];
