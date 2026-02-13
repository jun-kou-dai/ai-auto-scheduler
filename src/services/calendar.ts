// Phase C: Google Calendar API service
import { CalendarEvent, BusySlot, FreeSlot } from '../types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Custom error with HTTP status for 401 detection by callers
export class CalendarApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CalendarApiError';
    this.status = status;
  }
}

// C1: Get events for today and tomorrow
export async function getUpcomingEvents(
  accessToken: string,
  daysAhead: number = 2
): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + daysAhead);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new CalendarApiError(`カレンダー取得失敗 (${res.status}): ${errBody}`, res.status);
  }

  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary || '(無題)',
    start: { dateTime: item.start?.dateTime, date: item.start?.date },
    end: { dateTime: item.end?.dateTime, date: item.end?.date },
    description: item.description,
  }));
}

// C2: Get busy slots for next 7 days via freebusy query
export async function getBusySlots(
  accessToken: string,
  daysAhead: number = 7
): Promise<BusySlot[]> {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + daysAhead);

  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: 'primary' }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new CalendarApiError(`FreeBusy取得失敗 (${res.status}): ${errBody}`, res.status);
  }

  const data = await res.json();
  const busy = data.calendars?.primary?.busy || [];
  return busy.map((slot: any) => ({
    start: slot.start,
    end: slot.end,
  }));
}

// Calculate free slots from busy slots
export function calculateFreeSlots(
  busySlots: BusySlot[],
  daysAhead: number = 7,
  workStartHour: number = 6,
  workEndHour: number = 23
): FreeSlot[] {
  const freeSlots: FreeSlot[] = [];
  const now = new Date();

  for (let d = 0; d < daysAhead; d++) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, workStartHour, 0, 0);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, workEndHour, 0, 0);

    // Skip past times for today
    const effectiveStart = d === 0 && now > dayStart ? new Date(Math.ceil(now.getTime() / (30 * 60000)) * (30 * 60000)) : dayStart;

    if (effectiveStart >= dayEnd) continue;

    // Get busy slots for this day
    const dayBusy = busySlots
      .map((b) => ({
        start: new Date(b.start),
        end: new Date(b.end),
      }))
      .filter((b) => b.start < dayEnd && b.end > effectiveStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let cursor = effectiveStart;

    for (const busy of dayBusy) {
      if (cursor < busy.start) {
        const gapMinutes = (busy.start.getTime() - cursor.getTime()) / 60000;
        if (gapMinutes >= 15) {
          freeSlots.push({
            start: cursor.toISOString(),
            end: busy.start.toISOString(),
            durationMinutes: gapMinutes,
          });
        }
      }
      if (busy.end > cursor) {
        cursor = busy.end;
      }
    }

    // Remaining time after last busy slot
    if (cursor < dayEnd) {
      const gapMinutes = (dayEnd.getTime() - cursor.getTime()) / 60000;
      if (gapMinutes >= 15) {
        freeSlots.push({
          start: cursor.toISOString(),
          end: dayEnd.toISOString(),
          durationMinutes: gapMinutes,
        });
      }
    }
  }

  return freeSlots;
}

// C3: Create a calendar event
export async function createCalendarEvent(
  accessToken: string,
  title: string,
  startTime: string,
  endTime: string,
  description?: string
): Promise<CalendarEvent> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: title,
      description: description || 'AI Auto Scheduler で作成',
      start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new CalendarApiError(`イベント作成失敗 (${res.status}): ${errBody}`, res.status);
  }

  const data = await res.json();
  return {
    id: data.id,
    summary: data.summary,
    start: { dateTime: data.start?.dateTime, date: data.start?.date },
    end: { dateTime: data.end?.dateTime, date: data.end?.date },
    description: data.description,
  };
}

// Update an existing calendar event
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: { summary?: string; start?: string; end?: string; description?: string }
): Promise<CalendarEvent> {
  const body: any = {};
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.description !== undefined) body.description = updates.description;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (updates.start) body.start = { dateTime: updates.start, timeZone: tz };
  if (updates.end) body.end = { dateTime: updates.end, timeZone: tz };

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new CalendarApiError(`イベント更新失敗 (${res.status}): ${errBody}`, res.status);
  }

  const data = await res.json();
  return {
    id: data.id,
    summary: data.summary,
    start: { dateTime: data.start?.dateTime, date: data.start?.date },
    end: { dateTime: data.end?.dateTime, date: data.end?.date },
    description: data.description,
  };
}

// Delete a calendar event
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    const errBody = await res.text();
    throw new CalendarApiError(`イベント削除失敗 (${res.status}): ${errBody}`, res.status);
  }
}

// Create multiple events from proposal
export async function createEventsFromProposal(
  accessToken: string,
  events: { title: string; start: string; end: string }[]
): Promise<CalendarEvent[]> {
  const results: CalendarEvent[] = [];
  for (const evt of events) {
    const created = await createCalendarEvent(accessToken, evt.title, evt.start, evt.end);
    results.push(created);
  }
  return results;
}
