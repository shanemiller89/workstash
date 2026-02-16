import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import type { EventInput, DatesSetArg, EventClickArg } from '@fullcalendar/core';
import { useCalendarStore, type CalendarEventData, type CalendarListEntryData } from '../calendarStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { ResizableLayout } from './ResizableLayout';
import { TabWithSummary } from './TabWithSummary';
import {
    Calendar as CalendarIcon,
    RefreshCw,
    ExternalLink,
    MapPin,
    Clock,
    Video,
    X,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    LogOut,
    UserCircle,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';

// ─── Google Calendar event color palette ──────────────────────────
const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
    '1': '#7986CB', // Lavender
    '2': '#33B679', // Sage
    '3': '#8E24AA', // Grape
    '4': '#E67C73', // Flamingo
    '5': '#F6BF26', // Banana
    '6': '#F4511E', // Tangerine
    '7': '#039BE5', // Peacock
    '8': '#616161', // Graphite
    '9': '#3F51B5', // Blueberry
    '10': '#0B8043', // Basil
    '11': '#D50000', // Tomato
};

// ─── Helpers ──────────────────────────────────────────────────────

function getEventColor(event: CalendarEventData, calendars: CalendarListEntryData[]): string {
    if (event.colorId && GOOGLE_CALENDAR_COLORS[event.colorId]) {
        return GOOGLE_CALENDAR_COLORS[event.colorId];
    }
    if (event.calendarColor) {
        return event.calendarColor;
    }
    const cal = calendars.find((c) => c.id === event.calendarId);
    if (cal?.backgroundColor) {
        return cal.backgroundColor;
    }
    return 'var(--color-accent)';
}

function formatEventTime(dt: { dateTime?: string; date?: string }): string {
    if (dt.dateTime) {
        return new Date(dt.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (dt.date) {
        return 'All day';
    }
    return '';
}

function formatEventDateRange(event: CalendarEventData): string {
    const startDate = event.start.dateTime ? new Date(event.start.dateTime) : event.start.date ? new Date(event.start.date + 'T00:00:00') : null;
    const endDate = event.end.dateTime ? new Date(event.end.dateTime) : event.end.date ? new Date(event.end.date + 'T00:00:00') : null;

    if (!startDate) { return ''; }

    if (event.start.date && !event.start.dateTime) {
        // All-day event
        if (endDate && endDate.getTime() - startDate.getTime() > 86400000) {
            return `${startDate.toLocaleDateString()} – ${new Date(endDate.getTime() - 86400000).toLocaleDateString()}`;
        }
        return startDate.toLocaleDateString();
    }

    const startStr = startDate.toLocaleString([], {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    if (endDate) {
        const sameDay = startDate.toDateString() === endDate.toDateString();
        const endStr = sameDay
            ? endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : endDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return `${startStr} – ${endStr}`;
    }
    return startStr;
}

// ─── Calendar Sidebar (calendar list) ─────────────────────────────

const CalendarSidebar: React.FC = () => {
    const calendars = useCalendarStore((s) => s.calendars);
    const enabledCalendarIds = useCalendarStore((s) => s.enabledCalendarIds);
    const toggleCalendar = useCalendarStore((s) => s.toggleCalendar);
    const [expanded, setExpanded] = React.useState(true);

    if (calendars.length === 0) { return null; }

    return (
        <div className="border-b border-border px-3 py-2">
            <button
                className="flex items-center gap-1 text-xs font-medium text-fg/70 hover:text-fg w-full"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                My Calendars ({calendars.length})
            </button>
            {expanded && (
                <div className="mt-1 space-y-0.5">
                    {calendars.map((cal) => (
                        <label
                            key={cal.id}
                            className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-hover cursor-pointer text-xs"
                        >
                            <Checkbox
                                checked={enabledCalendarIds.has(cal.id)}
                                onCheckedChange={() => toggleCalendar(cal.id)}
                            />
                            <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: cal.backgroundColor ?? 'var(--color-accent)' }}
                            />
                            <span className="truncate">{cal.summary}</span>
                            {cal.primary && (
                                <Badge variant="outline" className="text-[10px] ml-auto">
                                    Primary
                                </Badge>
                            )}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Event Detail Panel ───────────────────────────────────────────

const EventDetail: React.FC<{ event: CalendarEventData; onClose: () => void }> = ({ event, onClose }) => {
    const calendars = useCalendarStore((s) => s.calendars);
    const color = getEventColor(event, calendars);
    const cal = calendars.find((c) => c.id === event.calendarId);

    // Find meeting link
    const meetingLink = event.hangoutLink
        ?? event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri;

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-sm mt-1 shrink-0" style={{ backgroundColor: color }} />
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold leading-tight">{event.summary ?? '(No title)'}</h2>
                        {cal && <p className="text-xs text-fg/50 mt-0.5">{cal.summary}</p>}
                    </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                    <X size={14} />
                </Button>
            </div>

            {/* Time */}
            <div className="flex items-center gap-2 text-sm text-fg/70">
                <Clock size={14} className="shrink-0" />
                <span>{formatEventDateRange(event)}</span>
            </div>

            {/* Location */}
            {event.location && (
                <div className="flex items-start gap-2 text-sm text-fg/70">
                    <MapPin size={14} className="shrink-0 mt-0.5" />
                    <span>{event.location}</span>
                </div>
            )}

            {/* Meeting link */}
            {meetingLink && (
                <div className="flex items-center gap-2 text-sm">
                    <Video size={14} className="shrink-0 text-fg/70" />
                    <a
                        href={meetingLink}
                        className="text-accent hover:underline truncate"
                        onClick={(e) => {
                            e.preventDefault();
                            postMessage('calendar.openLink', { url: meetingLink });
                        }}
                    >
                        Join meeting
                    </a>
                </div>
            )}

            {/* Description */}
            {event.description && (
                <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-fg/50 mb-1">Description</p>
                    <div
                        className="text-sm text-fg/80 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: event.description }}
                    />
                </div>
            )}

            {/* Attendees */}
            {event.attendees && event.attendees.length > 0 && (
                <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-fg/50 mb-1">
                        Attendees ({event.attendees.length})
                    </p>
                    <div className="space-y-1">
                        {event.attendees.map((a) => (
                            <div key={a.email} className="flex items-center gap-2 text-xs text-fg/70">
                                <span className="truncate">{a.displayName ?? a.email}</span>
                                {a.responseStatus === 'accepted' && (
                                    <Badge variant="success" className="text-[10px]">✓</Badge>
                                )}
                                {a.responseStatus === 'declined' && (
                                    <Badge variant="destructive" className="text-[10px]">✗</Badge>
                                )}
                                {a.responseStatus === 'tentative' && (
                                    <Badge variant="warning" className="text-[10px]">?</Badge>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Open in browser */}
            {event.htmlLink && (
                <div className="border-t border-border pt-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => postMessage('calendar.openLink', { url: event.htmlLink })}
                    >
                        <ExternalLink size={14} />
                        Open in Google Calendar
                    </Button>
                </div>
            )}
        </div>
    );
};

// ─── Main CalendarTab ─────────────────────────────────────────────

export const CalendarTab: React.FC = () => {
    const isAuthenticated = useCalendarStore((s) => s.isAuthenticated);
    const accountEmail = useCalendarStore((s) => s.accountEmail);
    const calendars = useCalendarStore((s) => s.calendars);
    const events = useCalendarStore((s) => s.events);
    const enabledCalendarIds = useCalendarStore((s) => s.enabledCalendarIds);
    const isLoading = useCalendarStore((s) => s.isLoading);
    const error = useCalendarStore((s) => s.error);
    const selectedEvent = useCalendarStore((s) => s.selectedEvent);
    const selectEvent = useCalendarStore((s) => s.selectEvent);
    const viewMode = useCalendarStore((s) => s.viewMode);
    const setViewMode = useCalendarStore((s) => s.setViewMode);
    const setVisibleRange = useCalendarStore((s) => s.setVisibleRange);
    const setLoading = useCalendarStore((s) => s.setLoading);

    const calendarRef = useRef<FullCalendar>(null);
    // Track whether we've already fetched for the current visible range
    const hasFetchedRef = useRef(false);

    // Request calendar data when authenticated
    useEffect(() => {
        if (isAuthenticated) {
            setLoading(true);
            postMessage('calendar.listCalendars');
        }
    }, [isAuthenticated, setLoading]);

    // Once calendars arrive AND we have a visible range, fetch events
    useEffect(() => {
        if (!isAuthenticated || calendars.length === 0) { return; }
        const { visibleRangeStart, visibleRangeEnd } = useCalendarStore.getState();
        if (visibleRangeStart && visibleRangeEnd && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            setLoading(true);
            postMessage('calendar.listEvents', {
                timeMin: visibleRangeStart,
                timeMax: visibleRangeEnd,
            });
        }
    }, [isAuthenticated, calendars, setLoading]);

    // Convert events to FullCalendar format, filtered by enabled calendars
    const fcEvents: EventInput[] = useMemo(() => {
        return events
            .filter((e) => !e.calendarId || enabledCalendarIds.has(e.calendarId))
            .map((e) => {
                const color = getEventColor(e, calendars);
                const isAllDay = !!e.start.date && !e.start.dateTime;
                return {
                    id: e.id,
                    title: e.summary ?? '(No title)',
                    start: e.start.dateTime ?? e.start.date ?? '',
                    end: e.end.dateTime ?? e.end.date ?? '',
                    allDay: isAllDay,
                    backgroundColor: color,
                    borderColor: color,
                    extendedProps: { calendarEvent: e },
                };
            });
    }, [events, enabledCalendarIds, calendars]);

    // When the visible date range changes, fetch events for that range
    const handleDatesSet = useCallback(
        (arg: DatesSetArg) => {
            const start = arg.startStr;
            const end = arg.endStr;
            setVisibleRange(start, end);
            setViewMode(arg.view.type as typeof viewMode);
            // Only fetch if authenticated — initial datesSet fires before auth is known
            if (useCalendarStore.getState().isAuthenticated) {
                hasFetchedRef.current = true;
                setLoading(true);
                postMessage('calendar.listEvents', { timeMin: start, timeMax: end });
            }
        },
        [setVisibleRange, setViewMode, setLoading],
    );

    const handleEventClick = useCallback(
        (info: EventClickArg) => {
            const calEvent = info.event.extendedProps.calendarEvent as CalendarEventData;
            selectEvent(calEvent);
        },
        [selectEvent],
    );

    const handleRefresh = useCallback(() => {
        hasFetchedRef.current = false;
        setLoading(true);
        postMessage('calendar.listCalendars');
        const store = useCalendarStore.getState();
        if (store.visibleRangeStart && store.visibleRangeEnd) {
            postMessage('calendar.listEvents', {
                timeMin: store.visibleRangeStart,
                timeMax: store.visibleRangeEnd,
            });
        }
    }, [setLoading]);

    // FullCalendar nav helpers for prev/next/today
    const goToday = useCallback(() => calendarRef.current?.getApi().today(), []);
    const goPrev = useCallback(() => calendarRef.current?.getApi().prev(), []);
    const goNext = useCallback(() => calendarRef.current?.getApi().next(), []);

    // Not authenticated — show sign-in prompt
    if (!isAuthenticated) {
        return (
            <div className="h-full bg-bg text-fg text-[13px] flex items-center justify-center">
                <div className="text-center space-y-4 max-w-sm">
                    <div className="text-4xl">📅</div>
                    <h2 className="text-lg font-semibold">Google Calendar</h2>
                    <p className="text-fg/60 text-sm">
                        Sign in with your Google account to view your calendar events and agenda.
                    </p>
                    <p className="text-fg/40 text-xs">
                        Requires a Google Cloud OAuth Client ID configured in settings.
                    </p>
                    <button
                        className="inline-flex items-center gap-2 px-4 py-2 rounded bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-medium"
                        onClick={() => postMessage('calendar.signIn')}
                    >
                        Sign in to Google
                    </button>
                </div>
            </div>
        );
    }

    return (
        <TabWithSummary tabKey="calendar">
        <div className="h-full flex flex-col bg-bg text-fg text-[13px]">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
                <CalendarIcon size={16} className="text-fg/60" />
                <span className="font-medium text-sm">Calendar</span>
                {accountEmail && (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <button className="flex items-center gap-1 text-xs text-fg/50 hover:text-fg truncate rounded px-1 py-0.5 hover:bg-hover transition-colors">
                                    <UserCircle size={12} />
                                    <span className="truncate max-w-30">{accountEmail}</span>
                                </button>
                            }
                        />
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => postMessage('calendar.signOut')}>
                                <LogOut size={14} />
                                Sign out
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                postMessage('calendar.signOut');
                                setTimeout(() => postMessage('calendar.signIn'), 500);
                            }}>
                                <UserCircle size={14} />
                                Switch account
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <div className="flex-1" />
                {/* Day-level navigation */}
                <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={goPrev} title="Previous">
                        <ChevronLeft size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={goToday} title="Today" className="text-xs px-2">
                        Today
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={goNext} title="Next">
                        <ChevronRight size={14} />
                    </Button>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={handleRefresh} title="Refresh">
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </Button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/30 text-destructive text-xs">
                    <AlertCircle size={14} />
                    <span className="flex-1 min-w-0">{error}</span>
                    {error.toLowerCase().includes('scope') || error.toLowerCase().includes('permission') ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs shrink-0 h-6"
                            onClick={() => {
                                useCalendarStore.getState().setError(null);
                                postMessage('calendar.signOut');
                                setTimeout(() => postMessage('calendar.signIn'), 500);
                            }}
                        >
                            Re-authenticate
                        </Button>
                    ) : null}
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0"
                        onClick={() => useCalendarStore.getState().setError(null)}
                    >
                        <X size={12} />
                    </Button>
                </div>
            )}

            {/* Calendar sidebar (calendar list) */}
            <CalendarSidebar />

            {/* Resizable calendar + event detail pane */}
            <div className="flex-1 overflow-clip">
                <ResizableLayout
                    storageKey="calendar"
                    hasSelection={selectedEvent !== null}
                    backLabel="Back to calendar"
                    onBack={() => selectEvent(null)}
                    defaultListSize={65}
                    listContent={
                        <div className="h-full overflow-clip p-2">
                            <div className="h-full fc-vscode-theme">
                                <FullCalendar
                                    ref={calendarRef}
                                    plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                                    initialView={viewMode}
                                    headerToolbar={{
                                        left: 'prev,next today',
                                        center: 'title',
                                        right: 'dayGridMonth,timeGridWeek,listDay',
                                    }}
                                    events={fcEvents}
                                    datesSet={handleDatesSet}
                                    eventClick={handleEventClick}
                                    height="100%"
                                    nowIndicator
                                    dayMaxEvents={3}
                                    eventDisplay="block"
                                    views={{
                                        listDay: { buttonText: 'Agenda' },
                                    }}
                                />
                            </div>
                        </div>
                    }
                    detailContent={
                        selectedEvent ? (
                            <EventDetail event={selectedEvent} onClose={() => selectEvent(null)} />
                        ) : <div />
                    }
                />
            </div>
        </div>
        </TabWithSummary>
    );
};
