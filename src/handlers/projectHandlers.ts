import * as vscode from 'vscode';
import { ProjectService } from '../projectService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `projects.*` messages from the webview. */
export const handleProjectMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'projects.refresh':
            await ctx.refreshProjects();
            return true;

        case 'projects.signIn':
            if (ctx.authService) {
                await ctx.authService.signIn();
                await ctx.refreshProjects();
            }
            return true;

        case 'projects.selectProject':
            if (ctx.projectService && msg.projectId) {
                try {
                    ctx.postMessage({ type: 'projectsItemsLoading' });
                    const project = await ctx.projectService.getProjectById(msg.projectId as string);
                    const projectData = ProjectService.toData(project);
                    ctx.postMessage({ type: 'projectData', payload: projectData });
                    const result = await ctx.projectService.listProjectItems(project.id);
                    const items = result.items.map((i) => ProjectService.toItemData(i));
                    ctx.postMessage({ type: 'projectItemsData', payload: items });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to load project: ${m}`);
                    ctx.postMessage({ type: 'projectError', message: m });
                }
            }
            return true;

        case 'projects.updateField':
            if (ctx.projectService && msg.projectId && msg.itemId && msg.fieldId && msg.value) {
                try {
                    ctx.postMessage({ type: 'projectFieldUpdating' });
                    await ctx.projectService.updateFieldValue(
                        msg.projectId as string,
                        msg.itemId as string,
                        msg.fieldId as string,
                        msg.value as Record<string, unknown>,
                    );
                    ctx.postMessage({ type: 'projectFieldUpdated' });
                    // Refresh items to get updated values
                    await ctx.refreshProjectItems(msg.projectId as string);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to update field: ${m}`);
                    ctx.postMessage({ type: 'projectError', message: m });
                }
            }
            return true;

        case 'projects.deleteItem':
            if (ctx.projectService && msg.projectId && msg.itemId) {
                try {
                    await ctx.projectService.deleteItem(
                        msg.projectId as string,
                        msg.itemId as string,
                    );
                    ctx.postMessage({
                        type: 'projectItemDeleted',
                        itemId: msg.itemId,
                    });
                    vscode.window.showInformationMessage('Item removed from project');
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to delete item: ${m}`);
                    ctx.postMessage({ type: 'projectError', message: m });
                }
            }
            return true;

        case 'projects.addDraftIssue':
            if (ctx.projectService && msg.projectId && msg.title) {
                try {
                    await ctx.projectService.addDraftIssue(
                        msg.projectId as string,
                        msg.title as string,
                        msg.body as string | undefined,
                    );
                    vscode.window.showInformationMessage('Draft issue added to project');
                    // Refresh items to include the new item
                    await ctx.refreshProjectItems(msg.projectId as string);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to add draft issue: ${m}`);
                    ctx.postMessage({ type: 'projectError', message: m });
                }
            }
            return true;

        case 'projects.addExistingItem':
            if (ctx.projectService && msg.projectId && msg.contentId) {
                try {
                    await ctx.projectService.addItemToProject(
                        msg.projectId as string,
                        msg.contentId as string,
                    );
                    vscode.window.showInformationMessage('Item added to project');
                    await ctx.refreshProjectItems(msg.projectId as string);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to add item: ${m}`);
                    ctx.postMessage({ type: 'projectError', message: m });
                }
            }
            return true;

        case 'projects.openInBrowser':
            if (msg.url) {
                vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
            }
            return true;

        default:
            return false;
    }
};
