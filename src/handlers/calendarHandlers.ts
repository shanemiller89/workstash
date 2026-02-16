import * as vscode from 'vscode';
import { extractErrorMessage } from '../utils';
import { ensureGoogleCredentials } from '../panelContext';
import type { CalendarEvent } from '../calendarService';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `calendar.*` messages from the webview. */
export const handleCalendarMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'calendar.signIn': {
            if (ctx.calendarService) {
                const configured = await ensureGoogleCredentials();
                if (!configured) { return true; }

                try {
                    await ctx.calendarService.signIn();
                    const isAuth = await ctx.calendarService.isAuthenticated();
                    ctx.postMessage({
                        type: 'calendarAuth',
                        authenticated: isAuth,
                    });
                } catch (e: unknown) {
                    ctx.outputChannel.appendLine(`[Calendar] Sign-in error: ${extractErrorMessage(e)}`);
                    vscode.window.showErrorMessage(`Google sign-in failed: ${extractErrorMessage(e)}`);
                }
            }
            return true;
        }

        case 'calendar.signOut': {
            if (ctx.calendarService) {
                await ctx.calendarService.signOut();
                ctx.postMessage({
                    type: 'calendarAuth',
                    authenticated: false,
                });
            }
            return true;
        }

        case 'calendar.listCalendars': {
            if (ctx.calendarService) {
                try {
                    ctx.outputChannel.appendLine('[Calendar] Fetching calendar list...');
                    const calendars = await ctx.calendarService.listCalendars();
                    ctx.outputChannel.appendLine(`[Calendar] Found ${calendars.length} calendars`);
                    ctx.postMessage({
                        type: 'calendarList',
                        calendars,
                    });
                } catch (e: unknown) {
                    const errorMsg = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(`[Calendar] List calendars error: ${errorMsg}`);
                    ctx.postMessage({
                        type: 'calendarError',
                        error: `Failed to load calendars: ${errorMsg}`,
                    });
                }
            }
            return true;
        }

        case 'calendar.listEvents': {
            if (ctx.calendarService) {
                try {
                    const timeMin = msg.timeMin as string | undefined;
                    const timeMax = msg.timeMax as string | undefined;

                    ctx.outputChannel.appendLine(`[Calendar] Fetching events (${timeMin ?? 'default'} → ${timeMax ?? 'default'})`);

                    // Fetch events from all calendars
                    const calendars = await ctx.calendarService.listCalendars();
                    const allEvents: unknown[] = [];
                    let errorCount = 0;

                    for (const cal of calendars) {
                        try {
                            const response = await ctx.calendarService.listEvents(
                                cal.id,
                                timeMin,
                                timeMax,
                            );
                            const calEvents = (response.items ?? []).map((event: CalendarEvent) => ({
                                ...event,
                                calendarId: cal.id,
                                calendarColor: cal.backgroundColor,
                            }));
                            allEvents.push(...calEvents);
                            ctx.outputChannel.appendLine(`[Calendar]   ${cal.summary}: ${calEvents.length} events`);
                        } catch (calErr: unknown) {
                            errorCount++;
                            ctx.outputChannel.appendLine(
                                `[Calendar]   Error fetching events for ${cal.summary}: ${extractErrorMessage(calErr)}`,
                            );
                        }
                    }

                    ctx.outputChannel.appendLine(`[Calendar] Total: ${allEvents.length} events from ${calendars.length - errorCount}/${calendars.length} calendars`);

                    ctx.postMessage({
                        type: 'calendarEvents',
                        events: allEvents,
                    });

                    if (errorCount > 0 && allEvents.length === 0) {
                        ctx.postMessage({
                            type: 'calendarError',
                            error: `Failed to fetch events from ${errorCount} calendar(s). Check the output channel for details.`,
                        });
                    }
                } catch (e: unknown) {
                    const errorMsg = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(`[Calendar] List events error: ${errorMsg}`);
                    ctx.postMessage({
                        type: 'calendarError',
                        error: `Failed to load events: ${errorMsg}`,
                    });
                }
            }
            return true;
        }

        case 'calendar.openLink': {
            if (msg.url) {
                await vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
            }
            return true;
        }

        default:
            return false;
    }
};
