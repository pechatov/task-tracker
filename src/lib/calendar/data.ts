import { and, asc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
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
import type { ProjectOption, StreamOption, TaskRow } from "@/lib/tasks/data";
import { getTaskSizeDurationMinutes, type TaskSize } from "@/lib/tasks/size";
import type { TaskStatus } from "@/lib/tasks/status";

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
  taskSize: TaskSize | null;
  taskStatus: TaskStatus | null;
  taskProjectName: string | null;
  taskProjectColor: string | null;
  taskIsRecurring: boolean;
  eventUrl: string | null;
  sourceLabel: string | null;
};

export type CalendarData = {
  today: string;
  items: CalendarItem[];
  backlogTasks: TaskRow[];
  overdueTasks: TaskRow[];
  projects: ProjectOption[];
  selectedTask: TaskRow | null;
  streams: StreamOption[];
};

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return formatDateInput(result);
}

function getTaskSizeEnd(startsAt: Date, size: TaskSize) {
  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + getTaskSizeDurationMinutes(size));
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

export async function getCalendarData(selectedTaskId?: string): Promise<CalendarData> {
  return withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const today = formatDateInput();
    const syncWindow = getCalendarSyncWindow(new Date());
    const windowStart = formatDateInput(syncWindow.startsAt);
    const windowEnd = formatDateInput(syncWindow.endsAt);

    await ensureRecurringTaskInstances(db, userId, windowStart, windowEnd);

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

    const [
      activeStreams,
      activeProjects,
      taskRows,
      backlogTasks,
      overdueTasks,
      eventRows,
      selectedTask
    ] = await Promise.all([
      db
        .select({
          id: streams.id,
          name: streams.name,
          color: streams.color
        })
        .from(streams)
        .where(and(eq(streams.userId, userId), eq(streams.status, "active")))
        .orderBy(asc(streams.name)),
      db
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
        .orderBy(asc(projects.name)),
      db
        .select(taskSelect)
        .from(tasks)
        .leftJoin(streams, eq(tasks.streamId, streams.id))
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(
          and(
            eq(tasks.userId, userId),
            inArray(tasks.status, ["open", "done"]),
            gte(tasks.dueDate, windowStart),
            lte(tasks.dueDate, windowEnd)
          )
        )
        .orderBy(
          asc(tasks.dueDate),
          asc(tasks.dayPriority),
          asc(tasks.createdAt)
        ),
      db
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
        .orderBy(asc(tasks.dayPriority), asc(tasks.createdAt)),
      db
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
        .orderBy(
          asc(tasks.dayPriority),
          asc(tasks.dueDate),
          asc(tasks.createdAt)
        ),
      db
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
        .orderBy(asc(calendarEvents.startsAt)),
      selectedTaskId
        ? db
            .select(taskSelect)
            .from(tasks)
            .leftJoin(streams, eq(tasks.streamId, streams.id))
            .leftJoin(projects, eq(tasks.projectId, projects.id))
            .where(and(eq(tasks.userId, userId), eq(tasks.id, selectedTaskId)))
            .limit(1)
        : Promise.resolve([])
    ]);

    const taskItems: CalendarItem[] = taskRows.flatMap((task) => {
      const color = task.projectColor ?? task.streamColor ?? "#2d7dd2";

      if (task.timeBlockStart) {
        return {
          id: `task-${task.id}`,
          kind: "task" as const,
          title: task.title,
          start: task.timeBlockStart.toISOString(),
          end: (task.timeBlockEnd ?? getTaskSizeEnd(task.timeBlockStart, task.size)).toISOString(),
          allDay: false,
          editable: true,
          color,
          taskId: task.id,
          taskSize: task.size,
          taskStatus: task.status,
          taskProjectName: task.projectName,
          taskProjectColor: task.projectColor,
          taskIsRecurring: task.recurringTaskId !== null,
          eventUrl: null,
          sourceLabel: null
        };
      }

      if (!task.dueDate) {
        return [];
      }

      return {
        id: `task-${task.id}`,
        kind: "task" as const,
        title: task.title,
        start: task.dueDate,
        end: addDays(task.dueDate, 1),
        allDay: true,
        editable: true,
        color,
        taskId: task.id,
        taskSize: task.size,
        taskStatus: task.status,
        taskProjectName: task.projectName,
        taskProjectColor: task.projectColor,
        taskIsRecurring: task.recurringTaskId !== null,
        eventUrl: null,
        sourceLabel: null
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
      taskSize: null,
      taskStatus: null,
      taskProjectName: null,
      taskProjectColor: null,
      taskIsRecurring: false,
      eventUrl: getEventUrl(event),
      sourceLabel: event.calendarName
    }));

    return {
      today,
      items: [...taskItems, ...calendarItems],
      backlogTasks,
      overdueTasks,
      projects: activeProjects,
      selectedTask: selectedTask[0] ?? null,
      streams: activeStreams
    };
  });
}
