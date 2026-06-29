import { and, asc, eq, gte, lte } from "drizzle-orm";
import { withDb } from "@/db/with-db";
import {
  calendarEvents,
  connectedCalendars,
  projects,
  streams,
  tasks
} from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";
import { getCalendarSyncWindow } from "@/lib/calendar/sync-window";
import { formatDateInput } from "@/lib/date";

export type CalendarItem = {
  id: string;
  kind: "task" | "calendar-event";
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  editable: boolean;
  color: string;
  taskId: string | null;
  eventUrl: string | null;
  sourceLabel: string | null;
};

export type CalendarData = {
  today: string;
  items: CalendarItem[];
};

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return formatDateInput(result);
}

function fallbackTimedTaskEnd(startsAt: Date) {
  const endsAt = new Date(startsAt);
  endsAt.setHours(endsAt.getHours() + 1);
  return endsAt;
}

function getEventUrl(event: { eventUrl: string | null; location: string | null }) {
  if (event.eventUrl) {
    return event.eventUrl;
  }

  if (event.location?.startsWith("http://") || event.location?.startsWith("https://")) {
    return event.location;
  }

  return null;
}

export async function getCalendarData(): Promise<CalendarData> {
  return withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const today = formatDateInput();
    const syncWindow = getCalendarSyncWindow(new Date());
    const windowStart = formatDateInput(syncWindow.startsAt);
    const windowEnd = formatDateInput(syncWindow.endsAt);

    const taskRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        streamName: streams.name,
        streamColor: streams.color,
        projectName: projects.name,
        projectColor: projects.color,
        timeBlockStart: tasks.timeBlockStart,
        timeBlockEnd: tasks.timeBlockEnd
      })
      .from(tasks)
      .leftJoin(streams, eq(tasks.streamId, streams.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "open"),
          gte(tasks.dueDate, windowStart),
          lte(tasks.dueDate, windowEnd)
        )
      )
      .orderBy(asc(tasks.dueDate), asc(tasks.dayPriority), asc(tasks.createdAt));

    const eventRows = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
        isAllDay: calendarEvents.isAllDay,
        eventUrl: calendarEvents.eventUrl,
        location: calendarEvents.location,
        calendarName: connectedCalendars.name,
        calendarColor: connectedCalendars.color
      })
      .from(calendarEvents)
      .innerJoin(
        connectedCalendars,
        eq(calendarEvents.connectedCalendarId, connectedCalendars.id)
      )
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(connectedCalendars.isEnabled, true),
          gte(calendarEvents.startsAt, syncWindow.startsAt),
          lte(calendarEvents.startsAt, syncWindow.endsAt)
        )
      )
      .orderBy(asc(calendarEvents.startsAt));

    const taskItems: CalendarItem[] = taskRows.map((task) => {
      const color = task.projectColor ?? task.streamColor ?? "#2d7dd2";
      const label = task.projectName ?? task.streamName;
      const title = label ? `${task.title} · ${label}` : task.title;

      if (task.timeBlockStart) {
        return {
          id: `task-${task.id}`,
          kind: "task",
          title,
          start: task.timeBlockStart.toISOString(),
          end: (task.timeBlockEnd ?? fallbackTimedTaskEnd(task.timeBlockStart)).toISOString(),
          allDay: false,
          editable: true,
          color,
          taskId: task.id,
          eventUrl: null,
          sourceLabel: label
        };
      }

      return {
        id: `task-${task.id}`,
        kind: "task",
        title,
        start: task.dueDate,
        end: addDays(task.dueDate, 1),
        allDay: true,
        editable: true,
        color,
        taskId: task.id,
        eventUrl: null,
        sourceLabel: label
      };
    });

    const calendarItems: CalendarItem[] = eventRows.map((event) => ({
      id: `calendar-event-${event.id}`,
      kind: "calendar-event",
      title: event.title,
      start: event.startsAt.toISOString(),
      end: event.endsAt.toISOString(),
      allDay: event.isAllDay,
      editable: false,
      color: event.calendarColor,
      taskId: null,
      eventUrl: getEventUrl(event),
      sourceLabel: event.calendarName
    }));

    return {
      today,
      items: [...taskItems, ...calendarItems]
    };
  });
}
