"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { projects, streams, tasks } from "@/db/schema";
import { getNextContextColor } from "@/lib/context/colors";
import { combineDateAndTime, formatDateInput } from "@/lib/date";
import {
  getCurrentUserId,
  getNextDayPriority,
  withDb
} from "@/lib/tasks/data";
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

function getTimeBlock(formData: FormData, dueDate: string) {
  const start = getString(formData, "timeBlockStart");
  const end = getString(formData, "timeBlockEnd");

  if (!start && !end) {
    return { timeBlockStart: null, timeBlockEnd: null };
  }

  if (!start || !end) {
    throw new Error("Both time block start and end are required");
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
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid calendar ${name}`);
  }

  return date;
}

export async function createTask(formData: FormData) {
  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const title = getString(formData, "title");
    const dueDate = getString(formData, "dueDate") || formatDateInput();
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
      streamId: context.streamId,
      projectId: context.projectId,
      ...timeBlock
    });
  });

  revalidatePath("/");
}

export async function updateTask(formData: FormData) {
  const taskId = getString(formData, "taskId");

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    const title = getString(formData, "title");
    const dueDate = getString(formData, "dueDate") || formatDateInput();
    const rawPriority = Number.parseInt(getString(formData, "dayPriority"), 10);
    const dayPriority = Number.isFinite(rawPriority) ? rawPriority : 1;

    if (!taskId || !title) {
      throw new Error("Task id and title are required");
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
        streamId: context.streamId,
        projectId: context.projectId,
        ...timeBlock,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  redirect("/");
}

export async function deleteTask(formData: FormData) {
  const taskId = getString(formData, "taskId");

  await withDb(async (db) => {
    const userId = await getCurrentUserId(db);
    await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });

  revalidatePath("/");
  redirect("/");
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
}

export async function scheduleTaskFromCalendar(formData: FormData) {
  const taskId = getString(formData, "taskId");
  const isAllDay = getString(formData, "isAllDay") === "true";
  const startsAt = parseCalendarDate(formData, "startsAt");
  const endsAt = parseCalendarDate(formData, "endsAt");
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
