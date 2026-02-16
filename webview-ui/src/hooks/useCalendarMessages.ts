/**
 * useCalendarMessages — dispatches extension→webview Google Calendar messages to the store.
 */
import { useCalendarStore, type CalendarEventData, type CalendarListEntryData } from '../calendarStore';

type Msg = { type: string; [key: string]: unknown };

export function handleCalendarMessage(msg: Msg): boolean {
    const s = useCalendarStore.getState();

    switch (msg.type) {
        case 'calendarAuth':
            s.setAuthenticated(
                msg.authenticated as boolean,
                msg.email as string | null,
            );
            return true;
        case 'calendarList':
            s.setCalendars(msg.calendars as CalendarListEntryData[]);
            return true;
        case 'calendarEvents':
            s.setEvents(msg.events as CalendarEventData[]);
            return true;
        case 'calendarError':
            s.setError(msg.error as string);
            return true;
        default:
            return false;
    }
}
