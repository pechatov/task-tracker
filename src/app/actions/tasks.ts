"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { projects, recurringTasks, streams, tasks } from "@/db/schema";
import { getCalendarSyncWindow } from "@/lib/calendar/sync-window";
import { getNextContextColor } from "@/lib/context/colors";
import {
  combineDateAndTime,
  formatDateInput,
  getMinutesFromStartOfDay,
  parseDateInputValue,
  startOfMoscowDate
} from "@/lib/date";
import { ensureRecurringTaskInstances } from "@/lib/recurring-tasks/data";
import {
  getDayOfMonth,
  getDayOfWeek,
  type RecurringTaskFrequency
} from "@/lib/recurring-tasks/schedule";
import {
  getCurrentUserId,
  getNextDayPriority,
  withDb
} from "@/lib/tasks/data";
import {
  getTaskSizeDurationMinutes,
  isTaskSize,
  type TaskSize
} from "@/lib/tasks/size";
import { isTaskStatus, type TaskStatus } from "@/lib/tasks/status";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, name: string) {
  const value = getString(formData, name);
  return value === "" ? null : value;
}

function getStatus(formData: FormData): TaskStatus {
  const value = getString(formData, "status");
  return isTaskStatus(value) ? value : "open";
}

function getSize(formData: FormData): TaskSize {
  const value = getString(formData, "size");
  return isTaskSize(value) ? value : "medium";
}

function getRecurringFrequency(formData: FormData): RecurringTaskFrequency {
  const value = getString(formData, "recurringFrequency");

  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }

  return "weekly";
}

function getPositiveInt(formData: FormData, name: string, fallback: number) {
  const value = Number.parseInt(getString(formData, name), 10);

  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return value;
}

type TaskReturnTo = "/" | "/calendar" | `/projects?projectId=${string}`;

function redirectTo(returnTo: TaskReturnTo): never {
  redirect(returnTo as Route);
}

function getReturnTo(formData: FormData): TaskReturnTo {
  const value = getString(formData, "returnTo");

  if (value === "/calendar") {
    return value;
  }

  const projectMatch =
    /^\/projects\?projectId=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.exec(
      value
    );

  return projectMatch ? (value as `/projects?projectId=${string}`) : "/";
}

function getDueDate(formData: FormData) {
  const value = getString(formData, "dueDate");
  return value ? parseDateInputValue(value) : null;
}

function getTaskIds(formData: FormData, name: string) {
  const value = getString(formData, name);

  if (!value) {
    return [];
  }

  const parsed: unknown = JSON.parse(value);

  if (!Array.isArray(parsed)) {
    throw new Error(`${name} must be an array`);
  }

  return [...new Set(parsed.filter((item): item is string => typeof item === "string"))];
}

function getTodayBoardDestination(formData: FormData) {
  const value = getString(formData, "destination");

  if (value === "today" || value === "backlog" || value === "week") {
    return value;
  }

  throw new Error("Invalid task board destination");
}

function getCalendarTaskList(formData: FormData) {
  const value = getString(formData, "list");

  if (value === "backlog" || value === "overdue") {
    return value;
  }

  throw new Error("Invalid calendar task list");
}

function ensureId(ids: string[], id: string) {
  return ids.includes(id) ? ids : [...ids, id];
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

function getCurrentWeekStart(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - daysFromMonday);
  return formatDateInput(date);
}

async function resolveTaskContext(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  userId: string,
  formData: FormData
) {
  const newStreamName = getString(formData, "newStreamName");
  const newProjectName = getString(formData, "newProjectName");
  const selectedStreamId = getNullableString(formData, "streamId");
  const selectedProjectId = getNullableString(formData, "projectId");

  let streamId = selectedStreamId;
  let projectId = selectedProjectId;

  if (newStreamName) {
    const streamColors = await db
      .select({ color: streams.color })
      .from(streams)
      .where(eq(streams.userId, userId));
    const color = getNextContextColor(streamColors.map((stream) => stream.color));

    const [stream] = await db
      .insert(streams)
      .values({
        userId,
        name: newStreamName,
        color,
        status: "active"
      })
      .onConflictDoUpdate({
        target: [streams.userId, streams.name],
        set: { status: "active", updatedAt: new Date() }
      })
      .returning({ id: streams.id });

    streamId = stream.id;
    projectId = null;
  }

  if (newProjectName) {
    if (!streamId) {
      throw new Error("Project requires an active stream");
    }

    const projectColors = await db
      .select({ color: projects.color })
      .from(projects)
      .where(eq(projects.userId, userId));
    const color = getNextContextColor(
      projectColors.map((project) => project.color)
    );

    const [project] = await db
      .insert(projects)
      .values({
        userId,
        streamId,
        name: newProjectName,
        color,
        status: "active"
      })
      .onConflictDoUpdate({
        target: [projects.userId, projects.streamId, projects.name],
        set: { status: "active", updatedAt: new Date() }
      })
      .returning({ id: projects.id, streamId: projects.streamId });

    projectId = project.id;
    streamId = project.streamId;
  } else if (projectId) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId))
    });

    if (project) {
      streamId = project.streamId;
    }
  }

  return { streamId, projectId };
}

function getTimeBlock(formData: FormData, dueDate: string | null) {
  const start = getString(formData, "timeBlockStart");
  const end = getString(formData, "timeBlockEnd");

  if (!start && !end) {
    return { timeBlockStart: null, timeBlockEnd: null };
  }

  if (!start || !end) {
    throw new Error("Both time block start and end are required");
  }

  if (!dueDate) {
    throw new Error("Time block requires a due date");
  }

  const timeBlockStart = combineDateAndTime(dueDate, start);
  const timeBlockEnd = combineDateAndTime(dueDate, end);

  if (timeBlockEnd <= timeBlockStart) {
    throw new Error("Time block end must be after start");
  }

  return { timeBlockStart, timeBlockEnd };
}

function parseCalendarDate(formData: FormData, name: string) {
  const value = getString(formData, name);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? startOfMoscowDate(value)
    : new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid calendar ${name}`);
  }

  return date;
}

function addMinutes(date: Date, minutes: number) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

function getRecurringConversionSchedule(formData: FormData, startDate: string) {
  const frequency = getRecurringFrequency(formData);

  return {
    frequency,
    interval: getPositiveInt(formData, "recurringInterval", 1),
    dayOfWeek: frequency === "weekly" ? getDayOfWeek(startDate) : null,
    dayOfMonth: frequency === "monthly" ? getDayOfMonth(startDate) : null
  };
}

async function ensureGeneratedRecurringInstances(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  userId: string,
  recurringTaskId?: string
) {
  const today = formatDateInput();
  const syncWindow = getCalendarSyncWindow(new Date());

  if (recurringTaskId) {
    await db
      .delete(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.recurringTaskId, recurringTaskId),
          eq(tasks.status, "open"),
          gte(tasks.dueDate, today)
        )
      );
  }

  await ensureRecurringTaskInstances(
    db,
    userId,
    formatDateInput(syncWindow.startsAt),
    formatDateInput(syncWindow.endsAt)
  );
}

export async function createTask(formData: FormData) {
  const returnTo = getReturnTo(formData);

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const title = getString(formData, "title");
    const dueDate = getDueDate(formData);
    const rawPriority = Number.parseInt(getString(formData, "dayPriority"), 10);
    const dayPriority = Number.isFinite(rawPriority)
      ? rawPriority
      : await getNextDayPriority(db, userId, dueDate);

    if (!title) {
      throw new Error("Task title is required");
    }

    const context = await resolveTaskContext(db, userId, formData);
    const timeBlock = getTimeBlock(formData, dueDate);

    await db.insert(tasks).values({
      userId,
      title,
      description: getNullableString(formData, "description"),
      dueDate,
      dayPriority,
      status: getStatus(formData),
      size: getSize(formData),
      streamId: context.streamId,
      projectId: context.projectId,
      ...timeBlock
    });
  });

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/projects");

  if (returnTo !== "/") {
    redirectTo(returnTo);
  }
}

export async function updateTask(formData: FormData) {
  const taskId = getString(formData, "taskId");
  const returnTo = getReturnTo(formData);
  const makeRecurring = getString(formData, "makeRecurring") === "true";

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const title = getString(formData, "title");
    let dueDate = getDueDate(formData);
    const rawPriority = Number.parseInt(getString(formData, "dayPriority"), 10);
    const dayPriority = Number.isFinite(rawPriority) ? rawPriority : 1;

    if (!taskId || !title) {
      throw new Error("Task id and title are required");
    }

    if (makeRecurring && !dueDate) {
      dueDate = formatDateInput();
    }

    const currentTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId))
    });

    if (!currentTask) {
      throw new Error("Task not found");
    }

    const context = await resolveTaskContext(db, userId, formData);
    const timeBlock = getTimeBlock(formData, dueDate);

    await db
      .update(tasks)
      .set({
        title,
        description: getNullableString(formData, "description"),
        dueDate,
        dayPriority,
        status: getStatus(formData),
        size: getSize(formData),
        streamId: context.streamId,
        projectId: context.projectId,
        ...timeBlock,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (makeRecurring && !currentTask.recurringTaskId && dueDate) {
      const [recurringTask] = await db
        .insert(recurringTasks)
        .values({
          userId,
          title,
          description: getNullableString(formData, "description"),
          startDate: dueDate,
          endDate: null,
          dayPriority,
          status: "active",
          size: getSize(formData),
          streamId: context.streamId,
          projectId: context.projectId,
          ...getRecurringConversionSchedule(formData, dueDate),
          timeBlockStartMinutes: getMinutesFromStartOfDay(timeBlock.timeBlockStart),
          timeBlockEndMinutes: getMinutesFromStartOfDay(timeBlock.timeBlockEnd)
        })
        .returning({ id: recurringTasks.id });

      await db
        .update(tasks)
        .set({
          recurringTaskId: recurringTask.id,
          recurringOccurrenceDate: dueDate,
          updatedAt: new Date()
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

      await ensureGeneratedRecurringInstances(db, userId, recurringTask.id);
    }
  });

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/projects");
  revalidatePath("/recurring");
  redirectTo(returnTo);
}

export async function deleteTask(formData: FormData) {
  const taskId = getString(formData, "taskId");
  const returnTo = getReturnTo(formData);

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/projects");
  redirectTo(returnTo);
}

export async function moveTaskToToday(formData: FormData) {
  const taskId = getString(formData, "taskId");

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const today = formatDateInput();
    const dayPriority = await getNextDayPriority(db, userId, today);

    await db
      .update(tasks)
      .set({
        dueDate: today,
        dayPriority,
        timeBlockStart: null,
        timeBlockEnd: null,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function moveTaskToBacklog(formData: FormData) {
  const taskId = getString(formData, "taskId");

  if (!taskId) {
    throw new Error("Task id is required");
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const dayPriority = await getNextDayPriority(db, userId, null);

    await db
      .update(tasks)
      .set({
        dueDate: null,
        dayPriority,
        timeBlockStart: null,
        timeBlockEnd: null,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function toggleTaskDone(formData: FormData) {
  const taskId = getString(formData, "taskId");

  if (!taskId) {
    throw new Error("Task id is required");
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId))
    });

    if (!task) {
      throw new Error("Task not found");
    }

    await db
      .update(tasks)
      .set({
        status: task.status === "done" ? "open" : "done",
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function moveTaskOnTodayBoard(formData: FormData) {
  const taskId = getString(formData, "taskId");
  const destination = getTodayBoardDestination(formData);
  let todayTaskIds = getTaskIds(formData, "todayTaskIds");
  let backlogTaskIds = getTaskIds(formData, "backlogTaskIds");

  if (!taskId) {
    throw new Error("Task id is required");
  }

  if (destination === "today") {
    todayTaskIds = ensureId(todayTaskIds, taskId);
  } else if (destination === "backlog") {
    backlogTaskIds = ensureId(backlogTaskIds, taskId);
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const today = formatDateInput();
    const tomorrow = addDays(today, 1);

    await db.transaction(async (tx) => {
      const [task] = await tx
        .select({ dueDate: tasks.dueDate })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
        .limit(1);

      if (!task) {
        throw new Error("Task not found");
      }

      const previousDueDate = task.dueDate;

      const [latestTomorrowTask] = await tx
        .select({ dayPriority: tasks.dayPriority })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.dueDate, tomorrow)))
        .orderBy(desc(tasks.dayPriority))
        .limit(1);
      const nextTomorrowPriority = (latestTomorrowTask?.dayPriority ?? 0) + 1;

      if (destination === "today" && previousDueDate !== today) {
        await tx
          .update(tasks)
          .set({
            dueDate: today,
            timeBlockStart: null,
            timeBlockEnd: null,
            updatedAt: new Date()
          })
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
      }

      if (destination === "week" && previousDueDate !== tomorrow) {
        await tx
          .update(tasks)
          .set({
            dueDate: tomorrow,
            dayPriority: nextTomorrowPriority,
            timeBlockStart: null,
            timeBlockEnd: null,
            updatedAt: new Date()
          })
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
      }

      if (destination === "backlog" && previousDueDate !== null) {
        await tx
          .update(tasks)
          .set({
            dueDate: null,
            timeBlockStart: null,
            timeBlockEnd: null,
            updatedAt: new Date()
          })
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
      }

      if (destination === "today" || previousDueDate === today) {
        for (const [index, id] of todayTaskIds.entries()) {
          await tx
            .update(tasks)
            .set({ dayPriority: index + 1, updatedAt: new Date() })
            .where(
              and(
                eq(tasks.id, id),
                eq(tasks.userId, userId),
                eq(tasks.dueDate, today)
              )
            );
        }
      }

      if (destination === "backlog" || previousDueDate === null) {
        for (const [index, id] of backlogTaskIds.entries()) {
          await tx
            .update(tasks)
            .set({ dayPriority: index + 1, updatedAt: new Date() })
            .where(
              and(
                eq(tasks.id, id),
                eq(tasks.userId, userId),
                isNull(tasks.dueDate)
              )
            );
        }
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function reorderCalendarTaskList(formData: FormData) {
  const list = getCalendarTaskList(formData);
  const taskIds = getTaskIds(formData, "taskIds");

  if (taskIds.length === 0) {
    return;
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const weekStart = getCurrentWeekStart(formatDateInput());

    await db.transaction(async (tx) => {
      for (const [index, id] of taskIds.entries()) {
        await tx
          .update(tasks)
          .set({ dayPriority: index + 1, updatedAt: new Date() })
          .where(
            and(
              eq(tasks.id, id),
              eq(tasks.userId, userId),
              list === "backlog" ? isNull(tasks.dueDate) : lt(tasks.dueDate, weekStart)
            )
          );
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function scheduleTaskFromCalendar(formData: FormData) {
  const taskId = getString(formData, "taskId");
  const isAllDay = getString(formData, "isAllDay") === "true";
  const wasAllDay = getString(formData, "wasAllDay") === "true";
  const startsAt = parseCalendarDate(formData, "startsAt");
  let endsAt = parseCalendarDate(formData, "endsAt");
  const dueDate = formatDateInput(startsAt);

  if (!taskId) {
    throw new Error("Task id is required");
  }

  if (endsAt <= startsAt) {
    throw new Error("Calendar task end must be after start");
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId))
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (wasAllDay && !isAllDay) {
      endsAt = addMinutes(startsAt, getTaskSizeDurationMinutes(task.size));
    }

    const dayPriority =
      task.dueDate === dueDate
        ? task.dayPriority
        : await getNextDayPriority(db, userId, dueDate);

    await db
      .update(tasks)
      .set({
        dueDate,
        dayPriority,
        timeBlockStart: isAllDay ? null : startsAt,
        timeBlockEnd: isAllDay ? null : endsAt,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  revalidatePath("/calendar");
}
