"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { and, eq, gte } from "drizzle-orm";
import { projects, recurringTasks, streams, tasks } from "@/db/schema";
import { getCalendarSyncWindow } from "@/lib/calendar/sync-window";
import { getNextContextColor } from "@/lib/context/colors";
import { formatDateInput, parseDateInputValue } from "@/lib/date";
import {
  ensureRecurringTaskInstances
} from "@/lib/recurring-tasks/data";
import {
  getDayOfMonth,
  getDayOfWeek,
  parseTimeToMinutes,
  type RecurringTaskFrequency
} from "@/lib/recurring-tasks/schedule";
import {
  getCurrentUserId,
  withDb
} from "@/lib/tasks/data";
import {
  isTaskSize,
  type TaskSize
} from "@/lib/tasks/size";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, name: string) {
  const value = getString(formData, name);
  return value === "" ? null : value;
}

function getSize(formData: FormData): TaskSize {
  const value = getString(formData, "size");
  return isTaskSize(value) ? value : "medium";
}

function getFrequency(formData: FormData): RecurringTaskFrequency {
  const value = getString(formData, "frequency");

  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }

  return "weekly";
}

function getStatus(formData: FormData): "active" | "paused" {
  return getString(formData, "status") === "paused" ? "paused" : "active";
}

function getRequiredDate(formData: FormData, name: string) {
  const value = getString(formData, name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return parseDateInputValue(value);
}

function getOptionalDate(formData: FormData, name: string) {
  const value = getString(formData, name);
  return value ? parseDateInputValue(value) : null;
}

function getPositiveInt(formData: FormData, name: string, fallback: number) {
  const value = Number.parseInt(getString(formData, name), 10);

  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return value;
}

function getOptionalBoundedInt(
  formData: FormData,
  name: string,
  min: number,
  max: number
) {
  const raw = getString(formData, name);

  if (!raw) {
    return null;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} is out of range`);
  }

  return value;
}

async function resolveRecurringTaskContext(
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

function getTimeBlockMinutes(formData: FormData) {
  const start = getString(formData, "timeBlockStart");
  const end = getString(formData, "timeBlockEnd");

  if (!start && !end) {
    return { timeBlockStartMinutes: null, timeBlockEndMinutes: null };
  }

  if (!start) {
    throw new Error("Time block start is required");
  }

  const timeBlockStartMinutes = parseTimeToMinutes(start);
  const timeBlockEndMinutes = end ? parseTimeToMinutes(end) : null;

  if (
    timeBlockEndMinutes !== null &&
    timeBlockEndMinutes <= timeBlockStartMinutes
  ) {
    throw new Error("Time block end must be after start");
  }

  return { timeBlockStartMinutes, timeBlockEndMinutes };
}

function getScheduleFields(formData: FormData, startDate: string) {
  const frequency = getFrequency(formData);
  const dayOfWeek =
    frequency === "weekly"
      ? getOptionalBoundedInt(formData, "dayOfWeek", 0, 6) ??
        getDayOfWeek(startDate)
      : null;
  const dayOfMonth =
    frequency === "monthly"
      ? getOptionalBoundedInt(formData, "dayOfMonth", 1, 31) ??
        getDayOfMonth(startDate)
      : null;

  return {
    frequency,
    interval: getPositiveInt(formData, "interval", 1),
    dayOfWeek,
    dayOfMonth
  };
}

function getRecurringTaskValues(formData: FormData) {
  const title = getString(formData, "title");
  const startDate = getRequiredDate(formData, "startDate");
  const endDate = getOptionalDate(formData, "endDate");
  const rawPriority = Number.parseInt(getString(formData, "dayPriority"), 10);
  const dayPriority = Number.isFinite(rawPriority) ? rawPriority : 1;

  if (!title) {
    throw new Error("Recurring task title is required");
  }

  if (endDate && endDate < startDate) {
    throw new Error("Recurring task end date must be after start date");
  }

  return {
    title,
    description: getNullableString(formData, "description"),
    startDate,
    endDate,
    dayPriority,
    status: getStatus(formData),
    size: getSize(formData),
    ...getScheduleFields(formData, startDate),
    ...getTimeBlockMinutes(formData)
  };
}

async function regenerateFutureOpenTasks(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  userId: string,
  recurringTaskId: string
) {
  const today = formatDateInput();
  const syncWindow = getCalendarSyncWindow(new Date());

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

  await ensureRecurringTaskInstances(
    db,
    userId,
    formatDateInput(syncWindow.startsAt),
    formatDateInput(syncWindow.endsAt)
  );
}

function revalidateRecurringTaskPaths() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/recurring");
}

export async function createRecurringTask(formData: FormData) {
  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const values = getRecurringTaskValues(formData);
    const context = await resolveRecurringTaskContext(db, userId, formData);

    await db.insert(recurringTasks).values({
      userId,
      ...values,
      streamId: context.streamId,
      projectId: context.projectId
    });

    const syncWindow = getCalendarSyncWindow(new Date());
    await ensureRecurringTaskInstances(
      db,
      userId,
      formatDateInput(syncWindow.startsAt),
      formatDateInput(syncWindow.endsAt)
    );
  });

  revalidateRecurringTaskPaths();
  redirect("/recurring" as Route);
}

export async function updateRecurringTask(formData: FormData) {
  const recurringTaskId = getString(formData, "recurringTaskId");

  if (!recurringTaskId) {
    throw new Error("Recurring task id is required");
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const values = getRecurringTaskValues(formData);
    const context = await resolveRecurringTaskContext(db, userId, formData);

    await db
      .update(recurringTasks)
      .set({
        ...values,
        streamId: context.streamId,
        projectId: context.projectId,
        updatedAt: new Date()
      })
      .where(
        and(eq(recurringTasks.id, recurringTaskId), eq(recurringTasks.userId, userId))
      );

    await regenerateFutureOpenTasks(db, userId, recurringTaskId);
  });

  revalidateRecurringTaskPaths();
  redirect("/recurring" as Route);
}

export async function deleteRecurringTask(formData: FormData) {
  const recurringTaskId = getString(formData, "recurringTaskId");

  if (!recurringTaskId) {
    throw new Error("Recurring task id is required");
  }

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const today = formatDateInput();

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

    await db
      .delete(recurringTasks)
      .where(
        and(eq(recurringTasks.id, recurringTaskId), eq(recurringTasks.userId, userId))
      );
  });

  revalidateRecurringTaskPaths();
  redirect("/recurring" as Route);
}
