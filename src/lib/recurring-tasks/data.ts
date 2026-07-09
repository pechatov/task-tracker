import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { cache } from "react";
import { createDb } from "@/db/client";
import { withDb } from "@/db/with-db";
import { projects, recurringTasks, streams, tasks } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";
import { getCalendarSyncWindow } from "@/lib/calendar/sync-window";
import { formatDateInput } from "@/lib/date";
import {
  combineDateAndMinutes,
  formatMinutesAsTime,
  getRecurringOccurrenceDates,
  type RecurringTaskFrequency
} from "@/lib/recurring-tasks/schedule";
import { getTaskSizeDurationMinutes, type TaskSize } from "@/lib/tasks/size";
import type { ProjectOption, StreamOption } from "@/lib/tasks/data";

export type RecurringTaskStatus = "active" | "paused";

export type RecurringTaskRow = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  dayPriority: number;
  status: RecurringTaskStatus;
  size: TaskSize;
  streamId: string | null;
  streamName: string | null;
  streamColor: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  frequency: RecurringTaskFrequency;
  interval: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeBlockStartMinutes: number | null;
  timeBlockEndMinutes: number | null;
};

export type RecurringTasksData = {
  projects: ProjectOption[];
  recurringTasks: RecurringTaskRow[];
  selectedRecurringTask: RecurringTaskRow | null;
  streams: StreamOption[];
  today: string;
};

const weekdayNames = [
  "воскресеньям",
  "понедельникам",
  "вторникам",
  "средам",
  "четвергам",
  "пятницам",
  "субботам"
];

function addMinutes(date: Date, minutes: number) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

function getGeneratedTimeBlock(
  occurrenceDate: string,
  startMinutes: number | null,
  endMinutes: number | null,
  size: TaskSize
) {
  if (startMinutes === null) {
    return { timeBlockStart: null, timeBlockEnd: null };
  }

  const timeBlockStart = combineDateAndMinutes(occurrenceDate, startMinutes);
  const timeBlockEnd =
    endMinutes === null
      ? addMinutes(timeBlockStart, getTaskSizeDurationMinutes(size))
      : combineDateAndMinutes(occurrenceDate, endMinutes);

  return { timeBlockStart, timeBlockEnd };
}

function recurringTaskSelect() {
  return {
    id: recurringTasks.id,
    title: recurringTasks.title,
    description: recurringTasks.description,
    startDate: recurringTasks.startDate,
    endDate: recurringTasks.endDate,
    dayPriority: recurringTasks.dayPriority,
    status: recurringTasks.status,
    size: recurringTasks.size,
    streamId: recurringTasks.streamId,
    streamName: streams.name,
    streamColor: streams.color,
    projectId: recurringTasks.projectId,
    projectName: projects.name,
    projectColor: projects.color,
    frequency: recurringTasks.frequency,
    interval: recurringTasks.interval,
    dayOfWeek: recurringTasks.dayOfWeek,
    dayOfMonth: recurringTasks.dayOfMonth,
    timeBlockStartMinutes: recurringTasks.timeBlockStartMinutes,
    timeBlockEndMinutes: recurringTasks.timeBlockEndMinutes
  };
}

export function getRecurringTaskScheduleLabel(task: RecurringTaskRow) {
  const interval = Math.max(1, task.interval);
  const time = task.timeBlockStartMinutes === null
    ? ""
    : `, ${formatMinutesAsTime(task.timeBlockStartMinutes)}`;

  if (task.frequency === "daily") {
    return interval === 1 ? `Каждый день${time}` : `Каждые ${interval} дн.${time}`;
  }

  if (task.frequency === "weekly") {
    const day = weekdayNames[task.dayOfWeek ?? 1] ?? "день недели";
    return interval === 1
      ? `По ${day}${time}`
      : `Каждые ${interval} нед., по ${day}${time}`;
  }

  const dayOfMonth = task.dayOfMonth ?? 1;
  return interval === 1
    ? `Каждый месяц, ${dayOfMonth} числа${time}`
    : `Каждые ${interval} мес., ${dayOfMonth} числа${time}`;
}

export async function ensureRecurringTaskInstances(
  db: ReturnType<typeof createDb>,
  userId: string,
  windowStart: string,
  windowEnd: string
) {
  const templates = await db
    .select({
      id: recurringTasks.id,
      title: recurringTasks.title,
      description: recurringTasks.description,
      startDate: recurringTasks.startDate,
      endDate: recurringTasks.endDate,
      dayPriority: recurringTasks.dayPriority,
      size: recurringTasks.size,
      streamId: recurringTasks.streamId,
      projectId: recurringTasks.projectId,
      frequency: recurringTasks.frequency,
      interval: recurringTasks.interval,
      dayOfWeek: recurringTasks.dayOfWeek,
      dayOfMonth: recurringTasks.dayOfMonth,
      timeBlockStartMinutes: recurringTasks.timeBlockStartMinutes,
      timeBlockEndMinutes: recurringTasks.timeBlockEndMinutes
    })
    .from(recurringTasks)
    .where(
      and(
        eq(recurringTasks.userId, userId),
        eq(recurringTasks.status, "active"),
        lte(recurringTasks.startDate, windowEnd),
        or(isNull(recurringTasks.endDate), gte(recurringTasks.endDate, windowStart))
      )
    );

  const generatedTasks: (typeof tasks.$inferInsert)[] = [];

  for (const template of templates) {
    const occurrenceDates = getRecurringOccurrenceDates(
      {
        dayOfMonth: template.dayOfMonth,
        dayOfWeek: template.dayOfWeek,
        endDate: template.endDate,
        frequency: template.frequency,
        interval: template.interval,
        startDate: template.startDate
      },
      windowStart,
      windowEnd
    );

    for (const occurrenceDate of occurrenceDates) {
      generatedTasks.push({
        userId,
        title: template.title,
        description: template.description,
        dueDate: occurrenceDate,
        dayPriority: template.dayPriority,
        status: "open",
        size: template.size,
        streamId: template.streamId,
        projectId: template.projectId,
        recurringTaskId: template.id,
        recurringOccurrenceDate: occurrenceDate,
        ...getGeneratedTimeBlock(
          occurrenceDate,
          template.timeBlockStartMinutes,
          template.timeBlockEndMinutes,
          template.size
        )
      });
    }
  }

  if (generatedTasks.length === 0) {
    return;
  }

  await db
    .insert(tasks)
    .values(generatedTasks)
    .onConflictDoNothing({
      target: [tasks.recurringTaskId, tasks.recurringOccurrenceDate]
    });
}

export async function ensureCurrentRecurringTaskInstancesForAllUsers() {
  const syncWindow = getCalendarSyncWindow(new Date());
  const windowStart = formatDateInput(syncWindow.startsAt);
  const windowEnd = formatDateInput(syncWindow.endsAt);

  await withDb(async (db) => {
    const userRows = await db
      .selectDistinct({ userId: recurringTasks.userId })
      .from(recurringTasks)
      .where(eq(recurringTasks.status, "active"));

    for (const { userId } of userRows) {
      await ensureRecurringTaskInstances(db, userId, windowStart, windowEnd);
    }
  });
}

export const getRecurringTasksData = cache(async (selectedRecurringTaskId?: string) => {
  return withDb<RecurringTasksData>(async (db) => {
    const userId = await requireCurrentUserId(db);

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

    const taskSelect = recurringTaskSelect();

    const recurringTaskRows = await db
      .select(taskSelect)
      .from(recurringTasks)
      .leftJoin(streams, eq(recurringTasks.streamId, streams.id))
      .leftJoin(projects, eq(recurringTasks.projectId, projects.id))
      .where(eq(recurringTasks.userId, userId))
      .orderBy(
        asc(recurringTasks.status),
        asc(recurringTasks.startDate),
        asc(recurringTasks.title)
      );

    const selectedRecurringTask = selectedRecurringTaskId
      ? await db
          .select(taskSelect)
          .from(recurringTasks)
          .leftJoin(streams, eq(recurringTasks.streamId, streams.id))
          .leftJoin(projects, eq(recurringTasks.projectId, projects.id))
          .where(
            and(
              eq(recurringTasks.userId, userId),
              eq(recurringTasks.id, selectedRecurringTaskId)
            )
          )
          .limit(1)
      : [];

    return {
      projects: activeProjects,
      recurringTasks: recurringTaskRows,
      selectedRecurringTask: selectedRecurringTask[0] ?? null,
      streams: activeStreams,
      today: formatDateInput()
    };
  });
});
