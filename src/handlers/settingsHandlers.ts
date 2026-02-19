import * as vscode from 'vscode';
import { AiService } from '../aiService';
import type { MessageHandler } from './types';

/** Handle `settings.*` and `openExternal` messages from the webview. */
export const handleSettingsMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'settings.getSettings': {
            const config = vscode.workspace.getConfiguration('superprompt-forge');
            ctx.postMessage({
                type: 'settingsData',
                settings: {
                    // Stash
                    autoRefresh: config.get<boolean>('autoRefresh', true),
                    confirmOnDrop: config.get<boolean>('confirmOnDrop', true),
                    confirmOnClear: config.get<boolean>('confirmOnClear', true),
                    showFileStatus: config.get<boolean>('showFileStatus', true),
                    defaultIncludeUntracked: config.get<boolean>('defaultIncludeUntracked', false),
                    sortOrder: config.get<string>('sortOrder', 'newest'),
                    showBranchInDescription: config.get<boolean>('showBranchInDescription', true),
                    // Notes
                    autosaveDelay: config.get<number>('notes.autosaveDelay', 30),
                    defaultVisibility: config.get<string>('notes.defaultVisibility', 'secret'),
                    // Mattermost
                    mattermostServerUrl: config.get<string>('mattermost.serverUrl', ''),
                    // GitHub
                    orgLogin: vscode.workspace.getConfiguration('superprompt-forge.github').get<string>('orgLogin', ''),
                    showOrgIssues: vscode.workspace.getConfiguration('superprompt-forge.github').get<boolean>('showOrgIssues', false),
                    // AI Privacy
                    includeSecretGists: config.get<boolean>('ai.includeSecretGists', false),
                    includePrivateMessages: config.get<boolean>('ai.includePrivateMessages', false),
                    // AI Provider
                    aiProvider: AiService.activeProvider(),
                    providerPreference: config.get<string>('ai.provider', 'auto'),
                    geminiApiKey: config.get<string>('ai.geminiApiKey', ''),
                    geminiModel: config.get<string>('ai.geminiModel', 'gemini-2.5-flash'),
                },
            });
            return true;
        }

        case 'settings.updateSetting': {
            const settingKey = msg.key as string;
            const settingValue = msg.value;
            if (!settingKey) { return true; }

            // Map setting keys to their VS Code configuration paths
            const SETTING_MAP: Record<string, { section: string; key: string }> = {
                autoRefresh: { section: 'superprompt-forge', key: 'autoRefresh' },
                confirmOnDrop: { section: 'superprompt-forge', key: 'confirmOnDrop' },
                confirmOnClear: { section: 'superprompt-forge', key: 'confirmOnClear' },
                showFileStatus: { section: 'superprompt-forge', key: 'showFileStatus' },
                defaultIncludeUntracked: { section: 'superprompt-forge', key: 'defaultIncludeUntracked' },
                sortOrder: { section: 'superprompt-forge', key: 'sortOrder' },
                showBranchInDescription: { section: 'superprompt-forge', key: 'showBranchInDescription' },
                autosaveDelay: { section: 'superprompt-forge.notes', key: 'autosaveDelay' },
                defaultVisibility: { section: 'superprompt-forge.notes', key: 'defaultVisibility' },
                mattermostServerUrl: { section: 'superprompt-forge.mattermost', key: 'serverUrl' },
                orgLogin: { section: 'superprompt-forge.github', key: 'orgLogin' },
                showOrgIssues: { section: 'superprompt-forge.github', key: 'showOrgIssues' },
                includeSecretGists: { section: 'superprompt-forge.ai', key: 'includeSecretGists' },
                includePrivateMessages: { section: 'superprompt-forge.ai', key: 'includePrivateMessages' },
                providerPreference: { section: 'superprompt-forge.ai', key: 'provider' },
                geminiApiKey: { section: 'superprompt-forge.ai', key: 'geminiApiKey' },
                geminiModel: { section: 'superprompt-forge.ai', key: 'geminiModel' },
            };

            const mapping = SETTING_MAP[settingKey];
            if (mapping) {
                await vscode.workspace
                    .getConfiguration(mapping.section)
                    .update(mapping.key, settingValue, vscode.ConfigurationTarget.Global);

                // If AI provider/key/model changed, re-send AI availability
                if (settingKey === 'providerPreference' || settingKey === 'geminiApiKey' || settingKey === 'geminiModel') {
                    ctx.postMessage({
                        type: 'aiAvailable',
                        available: AiService.isAvailable(),
                        provider: AiService.activeProvider(),
                    });
                }

                // If org settings changed, re-run projects/issues refresh so new org data loads immediately
                if (settingKey === 'orgLogin' || settingKey === 'showOrgIssues') {
                    await ctx.refreshProjects();
                    await ctx.refreshIssues();
                }
            }
            return true;
        }

        case 'settings.getOrgs': {
            if (ctx.projectService) {
                try {
                    const orgs = await ctx.projectService.listUserOrgs();
                    ctx.postMessage({ type: 'settingsOrgs', orgs });
                } catch (e: unknown) {
                    ctx.postMessage({ type: 'settingsOrgs', orgs: [] });
                }
            } else {
                ctx.postMessage({ type: 'settingsOrgs', orgs: [] });
            }
            return true;
        }

        case 'openExternal': {
            if (msg.url) {
                vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
            }
            return true;
        }

        case 'settings.openInVSCode': {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:shanemiller89.superprompt-forge');
            return true;
        }

        default:
            return false;
    }
};
