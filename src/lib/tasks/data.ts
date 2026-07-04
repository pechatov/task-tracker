import { and, asc, desc, eq, gt, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { cache } from "react";
import { createDb } from "@/db/client";
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
import { ensureRecurringTaskInstances } from "@/lib/recurring-tasks/data";

export { withDb };
export { requireCurrentUserId as getCurrentUserId } from "@/lib/auth/session";

export type StreamOption = {
  id: string;
  name: string;
  color: string;
};

export type ProjectOption = {
  id: string;
  name: string;
  color: string;
  streamId: string;
  streamName: string;
};

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  dayPriority: number;
  status: "open" | "done" | "cancelled";
  size: "small" | "medium" | "big";
  streamId: string | null;
  streamName: string | null;
  streamColor: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  recurringTaskId: string | null;
  timeBlockStart: Date | null;
  timeBlockEnd: Date | null;
};

export type CalendarEventRow = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  eventUrl: string | null;
  location: string | null;
  calendarName: string;
  calendarColor: string;
};

export type TodayData = {
  today: string;
  streams: StreamOption[];
  projects: ProjectOption[];
  dayTasks: TaskRow[];
  backlogTasks: TaskRow[];
  weekTasks: TaskRow[];
  overdueTasks: TaskRow[];
  timedTasks: TaskRow[];
  calendarEvents: CalendarEventRow[];
  selectedTask: TaskRow | null;
};

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

function getCurrentWeekEnd(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  return addDays(dateValue, day === 0 ? 0 : 7 - day);
}

export async function getNextDayPriority(
  db: ReturnType<typeof createDb>,
  userId: string,
  dueDate: string | null
) {
  const [latest] = await db
    .select({ dayPriority: tasks.dayPriority })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        dueDate === null ? isNull(tasks.dueDate) : eq(tasks.dueDate, dueDate)
      )
    )
    .orderBy(desc(tasks.dayPriority))
    .limit(1);

  return (latest?.dayPriority ?? 0) + 1;
}

export const getTodayData = cache(async (selectedTaskId?: string) => {
  return withDb<TodayData>(async (db) => {
    const userId = await requireCurrentUserId(db);
    const today = formatDateInput();
    const weekEnd = getCurrentWeekEnd(today);
    const syncWindow = getCalendarSyncWindow(new Date());

    await ensureRecurringTaskInstances(
      db,
      userId,
      formatDateInput(syncWindow.startsAt),
      formatDateInput(syncWindow.endsAt)
    );

    const activeStreams = await db
      .select({
        id: streams.id,
        name: streams.name,
        color: streams.color
      })
      .from(streams)
      .where(and(eq(streams.userId, userId), eq(streams.status, "active")))
      .orderBy(asc(streams.name));

    const activeProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        color: projects.color,
        streamId: streams.id,
        streamName: streams.name
      })
      .from(projects)
      .innerJoin(streams, eq(projects.streamId, streams.id))
      .where(
        and(
          eq(projects.userId, userId),
          eq(projects.status, "active"),
          eq(streams.status, "active")
        )
      )
      .orderBy(asc(projects.name));

    const taskSelect = {
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      dueDate: tasks.dueDate,
      dayPriority: tasks.dayPriority,
      status: tasks.status,
      size: tasks.size,
      streamId: tasks.streamId,
      streamName: streams.name,
      streamColor: streams.color,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      recurringTaskId: tasks.recurringTaskId,
      timeBlockStart: tasks.timeBlockStart,
      timeBlockEnd: tasks.timeBlockEnd
    };

    const openTodayTasks = await db
      .select(taskSelect)
      .from(tasks)
      .leftJoin(streams, eq(tasks.streamId, streams.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "open"),
          eq(tasks.dueDate, today)
        )
      )
      .orderBy(asc(tasks.dayPriority), asc(tasks.createdAt));

    const backlogTasks = await db
      .select(taskSelect)
      .from(tasks)
      .leftJoin(streams, eq(tasks.streamId, streams.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "open"),
          isNull(tasks.dueDate)
        )
      )
      .orderBy(asc(tasks.dayPriority), asc(tasks.createdAt));

    const weekTasks = await db
      .select(taskSelect)
      .from(tasks)
      .leftJoin(streams, eq(tasks.streamId, streams.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "open"),
          gt(tasks.dueDate, today),
          lte(tasks.dueDate, weekEnd)
        )
      )
      .orderBy(asc(tasks.dueDate), asc(tasks.dayPriority), asc(tasks.createdAt));

    const overdueTasks = await db
      .select(taskSelect)
      .from(tasks)
      .leftJoin(streams, eq(tasks.streamId, streams.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "open"),
          lt(tasks.dueDate, today)
        )
      )
      .orderBy(asc(tasks.dueDate), asc(tasks.dayPriority), asc(tasks.createdAt));

    const timedTasks = await db
      .select(taskSelect)
      .from(tasks)
      .leftJoin(streams, eq(tasks.streamId, streams.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "open"),
          eq(tasks.dueDate, today),
          isNotNull(tasks.timeBlockStart)
        )
      )
      .orderBy(asc(tasks.timeBlockStart));

    const todaysCalendarEvents = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
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
      .where(and(eq(calendarEvents.userId, userId), eq(connectedCalendars.isEnabled, true)))
      .orderBy(asc(calendarEvents.startsAt));

    const selectedTask = selectedTaskId
      ? await db
          .select(taskSelect)
          .from(tasks)
          .leftJoin(streams, eq(tasks.streamId, streams.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .where(and(eq(tasks.userId, userId), eq(tasks.id, selectedTaskId)))
          .limit(1)
      : [];

    return {
      today,
      streams: activeStreams,
      projects: activeProjects,
      dayTasks: openTodayTasks,
      backlogTasks,
      weekTasks,
      overdueTasks,
      timedTasks,
      calendarEvents: todaysCalendarEvents.filter(
        (event) => formatDateInput(event.startsAt) === today
      ),
      selectedTask: selectedTask[0] ?? null
    };
  });
});
