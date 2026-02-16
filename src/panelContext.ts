import * as vscode from 'vscode';
import { GitService } from './gitService';
import { AuthService } from './authService';
import { GistService } from './gistService';
import { PrService } from './prService';
import { IssueService } from './issueService';
import { MattermostService } from './mattermostService';
import { ProjectService } from './projectService';
import { GoogleDriveService } from './googleDriveService';
import { GoogleCalendarService } from './calendarService';
import { WikiService } from './wikiService';

// ─── PanelServices ────────────────────────────────────────────────

/**
 * Services bag passed to `StashPanel.createOrShow()`.
 * Groups all optional service dependencies into a single object,
 * replacing the previous 12-parameter function signature.
 */
export interface PanelServices {
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

// ─── Google OAuth Credential Prompting ────────────────────────────

/**
 * Prompt the user for Google OAuth Client ID and Client Secret via
 * VS Code input boxes, persisting them to global settings.
 *
 * Returns `true` if both credentials are now configured,
 * `false` if the user cancelled at any step.
 *
 * Shared across:
 *   - `extension.ts` → `superprompt-forge.drive.signIn` command
 *   - `stashPanel.ts` → `drive.signIn` handler
 *   - `stashPanel.ts` → `calendar.signIn` handler
 */
export async function ensureGoogleCredentials(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('superprompt-forge.google');
    let clientId = config.get<string>('clientId', '').trim();
    let clientSecret = config.get<string>('clientSecret', '').trim();

    if (!clientId) {
        const input = await vscode.window.showInputBox({
            title: 'Google OAuth — Client ID',
            prompt: 'Enter your Google OAuth 2.0 Client ID (from Google Cloud Console → APIs & Services → Credentials)',
            placeHolder: 'xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com',
            ignoreFocusOut: true,
        });
        if (!input) {
            return false;
        }
        clientId = input.trim();
        await config.update('clientId', clientId, vscode.ConfigurationTarget.Global);
    }

    if (!clientSecret) {
        const input = await vscode.window.showInputBox({
            title: 'Google OAuth — Client Secret',
            prompt: 'Enter your Google OAuth 2.0 Client Secret',
            placeHolder: 'GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx',
            password: true,
            ignoreFocusOut: true,
        });
        if (!input) {
            return false;
        }
        clientSecret = input.trim();
        await config.update('clientSecret', clientSecret, vscode.ConfigurationTarget.Global);
    }

    return true;
}
