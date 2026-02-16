import * as vscode from 'vscode';
import { WikiService } from '../wikiService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, WebviewMessage, MessageHandler } from './types';

/** Handle all `wiki.*` messages from the webview. */
export const handleWikiMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'wiki.refresh':
            await ctx.refreshWiki();
            return true;

        case 'wiki.signIn':
            await vscode.commands.executeCommand('superprompt-forge.issues.signIn');
            await ctx.sendAuthStatus();
            await ctx.refreshWiki();
            return true;

        case 'wiki.getPage': {
            if (msg.filename && ctx.wikiService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'wikiPageLoading' });
                    const page = await ctx.wikiService.getPageContent(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.filename as string,
                    );
                    ctx.postMessage({
                        type: 'wikiPageContent',
                        page: WikiService.toPageData(page),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.postMessage({ type: 'wikiError', message: m });
                }
            }
            return true;
        }

        case 'wiki.openInBrowser': {
            const repoInfo = await ctx.getRepoInfo();
            if (repoInfo) {
                const wikiUrl = ctx.wikiService
                    ? ctx.wikiService.getWikiUrl(repoInfo.owner, repoInfo.repo)
                    : `https://github.com/${repoInfo.owner}/${repoInfo.repo}/wiki`;
                await vscode.env.openExternal(vscode.Uri.parse(wikiUrl));
            }
            return true;
        }

        case 'wiki.openPageInBrowser': {
            if (msg.filename && ctx.wikiService) {
                const repoInfo = await ctx.getRepoInfo();
                if (repoInfo) {
                    const pageUrl = ctx.wikiService.getPageUrl(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.filename as string,
                    );
                    await vscode.env.openExternal(vscode.Uri.parse(pageUrl));
                }
            }
            return true;
        }

        default:
            return false;
    }
};
