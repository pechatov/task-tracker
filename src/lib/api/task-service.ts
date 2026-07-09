import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL
} from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  calendarEvents,
  connectedCalendars,
  projects,
  streams,
  tasks
} from "@/db/schema";
import {
  combineDateAndTime,
  endOfMoscowDate,
  formatDateInput,
  parseDateInputValue,
  startOfMoscowDate
} from "@/lib/date";
import { ensureRecurringTaskInstances } from "@/lib/recurring-tasks/data";
import { getNextDayPriority } from "@/lib/tasks/data";
import { isTaskSize, type TaskSize } from "@/lib/tasks/size";
import { isTaskStatus, type TaskStatus } from "@/lib/tasks/status";

export class ApiServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export type ApiTask = {
  createdAt: string;
  dayPriority: number;
  description: string | null;
  dueDate: string | null;
  id: string;
  project: {
    color: string;
    id: string;
    name: string;
  } | null;
  recurringTaskId: string | null;
  size: TaskSize;
  status: TaskStatus;
  stream: {
    color: string;
    id: string;
    name: string;
  } | null;
  timeBlock: {
    endsAt: string;
    startsAt: string;
  } | null;
  title: string;
  updatedAt: string;
};

export type ApiCalendarItem =
  | {
      allDay: boolean;
      editable: true;
      end: string | null;
      id: string;
      kind: "task";
      start: string;
      task: ApiTask;
      title: string;
    }
  | {
      allDay: boolean;
      editable: false;
      end: string;
      eventUrl: string | null;
      id: string;
      kind: "calendar-event";
      location: string | null;
      sourceLabel: string;
      start: string;
      title: string;
    };

type TaskSelectRow = {
  createdAt: Date;
  dayPriority: number;
  description: string | null;
  dueDate: string | null;
  id: string;
  projectColor: string | null;
  projectId: string | null;
  projectName: string | null;
  recurringTaskId: string | null;
  size: TaskSize;
  status: TaskStatus;
  streamColor: string | null;
  streamId: string | null;
  streamName: string | null;
  timeBlockEnd: Date | null;
  timeBlockStart: Date | null;
  title: string;
  updatedAt: Date;
};

export type TaskTimeBlockInput = {
  endsAt: string;
  startsAt: string;
};

export type CreateTaskInput = {
  dayPriority?: number;
  description?: string | null;
  dueDate?: string | null;
  projectId?: string | null;
  size?: string;
  status?: string;
  streamId?: string | null;
  timeBlock?: TaskTimeBlockInput | null;
  title: string;
};

export type UpdateTaskInput = {
  dayPriority?: number;
  description?: string | null;
  dueDate?: string | null;
  projectId?: string | null;
  size?: string;
  status?: string;
  streamId?: string | null;
  timeBlock?: TaskTimeBlockInput | null;
  title?: string;
};

export type ListTasksInput = {
  from?: string;
  includeBacklog?: boolean;
  status?: TaskStatus | "all";
  to?: string;
};

export type CalendarPlanInput = {
  from: string;
  to: string;
};

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
  timeBlockEnd: tasks.timeBlockEnd,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt
};

function normalizeNullableText(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeTitle(value: string) {
  const title = value.trim();

  if (!title) {
    throw new ApiServiceError("Task title is required");
  }

  return title;
}

function normalizeDate(value: string | null | undefined) {
  if (value == null || value === "") {
    return null;
  }

  try {
    return parseDateInputValue(value);
  } catch {
    throw new ApiServiceError("Date must use yyyy-mm-dd format");
  }
}

function normalizeStatus(value: string | undefined) {
  if (value == null) {
    return "open" satisfies TaskStatus;
  }

  if (!isTaskStatus(value)) {
    throw new ApiServiceError("Invalid task status");
  }

  return value;
}

function normalizeSize(value: string | undefined) {
  if (value == null) {
    return "medium" satisfies TaskSize;
  }

  if (!isTaskSize(value)) {
    throw new ApiServiceError("Invalid task size");
  }

  return value;
}

function normalizePriority(value: number | undefined) {
  if (value == null) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new ApiServiceError("dayPriority must be a positive integer");
  }

  return value;
}

function parseDateTime(value: string, field: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiServiceError(`${field} must be a valid ISO date-time`);
  }

  return date;
}

function normalizeTimeBlock(
  timeBlock: TaskTimeBlockInput,
  dueDate: string | null | undefined
) {
  const startsAt = parseDateTime(timeBlock.startsAt, "timeBlock.startsAt");
  const endsAt = parseDateTime(timeBlock.endsAt, "timeBlock.endsAt");

  if (endsAt <= startsAt) {
    throw new ApiServiceError("timeBlock.endsAt must be after startsAt");
  }

  const derivedDueDate = formatDateInput(startsAt);

  if (dueDate && dueDate !== derivedDueDate) {
    throw new ApiServiceError(
      "dueDate must match the task timeBlock date in the app time zone"
    );
  }

  return {
    dueDate: derivedDueDate,
    timeBlockEnd: endsAt,
    timeBlockStart: startsAt
  };
}

function serializeTask(row: TaskSelectRow): ApiTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    dayPriority: row.dayPriority,
    status: row.status,
    size: row.size,
    stream:
      row.streamId && row.streamName && row.streamColor
        ? {
            id: row.streamId,
            name: row.streamName,
            color: row.streamColor
          }
        : null,
    project:
      row.projectId && row.projectName && row.projectColor
        ? {
            id: row.projectId,
            name: row.projectName,
            color: row.projectColor
          }
        : null,
    recurringTaskId: row.recurringTaskId,
    timeBlock:
      row.timeBlockStart && row.timeBlockEnd
        ? {
            startsAt: row.timeBlockStart.toISOString(),
            endsAt: row.timeBlockEnd.toISOString()
          }
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function selectTaskById(db: Db, userId: string, taskId: string) {
  const [task] = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(streams, eq(tasks.streamId, streams.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);

  return task ?? null;
}

async function resolveContext(
  db: Db,
  userId: string,
  input: {
    projectId?: string | null;
    streamId?: string | null;
  },
  current?: {
    projectId: string | null;
    streamId: string | null;
  }
) {
  let streamId = current?.streamId ?? null;
  let projectId = current?.projectId ?? null;

  if (input.projectId !== undefined) {
    if (input.projectId === null) {
      projectId = null;
    } else {
      const project = await db
        .select({
          id: projects.id,
          streamId: projects.streamId
        })
        .from(projects)
        .innerJoin(streams, eq(projects.streamId, streams.id))
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, userId),
            eq(projects.status, "active"),
            eq(streams.status, "active")
          )
        )
        .limit(1);

      if (!project[0]) {
        throw new ApiServiceError("Project not found", 404);
      }

      return {
        projectId: project[0].id,
        streamId: project[0].streamId
      };
    }
  }

  if (input.streamId !== undefined) {
    if (input.streamId === null) {
      streamId = null;
      projectId = null;
    } else {
      const stream = await db.query.streams.findFirst({
        where: and(
          eq(streams.id, input.streamId),
          eq(streams.userId, userId),
          eq(streams.status, "active")
        )
      });

      if (!stream) {
        throw new ApiServiceError("Stream not found", 404);
      }

      streamId = stream.id;
      if (input.projectId === undefined) {
        projectId = null;
      }
    }
  }

  return { projectId, streamId };
}

export async function listContextsForUser(db: Db, userId: string) {
  const [streamRows, projectRows] = await Promise.all([
    db
      .select({
        color: streams.color,
        id: streams.id,
        name: streams.name
      })
      .from(streams)
      .where(and(eq(streams.userId, userId), eq(streams.status, "active")))
      .orderBy(asc(streams.name)),
    db
      .select({
        color: projects.color,
        id: projects.id,
        name: projects.name,
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
      .orderBy(asc(projects.name))
  ]);

  return {
    streams: streamRows,
    projects: projectRows
  };
}

export async function listTasksForUser(
  db: Db,
  userId: string,
  input: ListTasksInput
) {
  const conditions: SQL[] = [eq(tasks.userId, userId)];
  const dateConditions: SQL[] = [];
  const status = input.status ?? "all";

  if (status !== "all") {
    conditions.push(eq(tasks.status, status));
  }

  if (input.from) {
    const from = normalizeDate(input.from);

    if (!from) {
      throw new ApiServiceError("from must be a date");
    }

    dateConditions.push(gte(tasks.dueDate, from));
  }

  if (input.to) {
    const to = normalizeDate(input.to);

    if (!to) {
      throw new ApiServiceError("to must be a date");
    }

    dateConditions.push(lte(tasks.dueDate, to));
  }

  if (dateConditions.length > 0) {
    const dateRangeCondition = and(...dateConditions);

    if (!dateRangeCondition) {
      throw new ApiServiceError("Invalid date filter");
    }

    if (input.includeBacklog === false) {
      conditions.push(dateRangeCondition);
    } else {
      const dateOrBacklogCondition = or(
        dateRangeCondition,
        isNull(tasks.dueDate)
      );

      if (!dateOrBacklogCondition) {
        throw new ApiServiceError("Invalid date filter");
      }

      conditions.push(dateOrBacklogCondition);
    }
  } else if (input.includeBacklog === false) {
    conditions.push(isNotNull(tasks.dueDate));
  }

  const rows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(streams, eq(tasks.streamId, streams.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.dueDate), asc(tasks.dayPriority), asc(tasks.createdAt));

  return rows.map(serializeTask);
}

export async function getTaskForUser(db: Db, userId: string, taskId: string) {
  const task = await selectTaskById(db, userId, taskId);

  if (!task) {
    throw new ApiServiceError("Task not found", 404);
  }

  return serializeTask(task);
}

export async function createTaskForUser(
  db: Db,
  userId: string,
  input: CreateTaskInput
) {
  const title = normalizeTitle(input.title);
  let dueDate = normalizeDate(input.dueDate);
  let timeBlockStart: Date | null = null;
  let timeBlockEnd: Date | null = null;

  if (input.timeBlock) {
    const timeBlock = normalizeTimeBlock(input.timeBlock, dueDate);
    dueDate = timeBlock.dueDate;
    timeBlockStart = timeBlock.timeBlockStart;
    timeBlockEnd = timeBlock.timeBlockEnd;
  }

  const dayPriority =
    normalizePriority(input.dayPriority) ??
    (await getNextDayPriority(db, userId, dueDate));
  const context = await resolveContext(db, userId, input);
  const [created] = await db
    .insert(tasks)
    .values({
      userId,
      title,
      description: normalizeNullableText(input.description),
      dueDate,
      dayPriority,
      status: normalizeStatus(input.status),
      size: normalizeSize(input.size),
      streamId: context.streamId,
      projectId: context.projectId,
      timeBlockStart,
      timeBlockEnd
    })
    .returning({ id: tasks.id });

  return getTaskForUser(db, userId, created.id);
}

export async function updateTaskForUser(
  db: Db,
  userId: string,
  taskId: string,
  input: UpdateTaskInput
) {
  const current = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId))
  });

  if (!current) {
    throw new ApiServiceError("Task not found", 404);
  }

  const update: Partial<typeof tasks.$inferInsert> = {
    updatedAt: new Date()
  };
  let nextDueDate = current.dueDate;
  let dueDateChanged = false;

  if (input.title !== undefined) {
    update.title = normalizeTitle(input.title);
  }

  if (input.description !== undefined) {
    update.description = normalizeNullableText(input.description);
  }

  if (input.status !== undefined) {
    update.status = normalizeStatus(input.status);
  }

  if (input.size !== undefined) {
    update.size = normalizeSize(input.size);
  }

  if (input.timeBlock !== undefined) {
    if (input.timeBlock === null) {
      update.timeBlockStart = null;
      update.timeBlockEnd = null;
      if (input.dueDate !== undefined) {
        nextDueDate = normalizeDate(input.dueDate);
      }
    } else {
      const timeBlock = normalizeTimeBlock(
        input.timeBlock,
        input.dueDate === undefined ? undefined : normalizeDate(input.dueDate)
      );
      nextDueDate = timeBlock.dueDate;
      update.timeBlockStart = timeBlock.timeBlockStart;
      update.timeBlockEnd = timeBlock.timeBlockEnd;
    }
  } else if (input.dueDate !== undefined) {
    nextDueDate = normalizeDate(input.dueDate);
    update.timeBlockStart = null;
    update.timeBlockEnd = null;
  }

  if (nextDueDate !== current.dueDate) {
    dueDateChanged = true;
    update.dueDate = nextDueDate;
  }

  if (input.dayPriority !== undefined) {
    update.dayPriority = normalizePriority(input.dayPriority);
  } else if (dueDateChanged) {
    update.dayPriority = await getNextDayPriority(db, userId, nextDueDate);
  }

  if (input.projectId !== undefined || input.streamId !== undefined) {
    const context = await resolveContext(db, userId, input, {
      projectId: current.projectId,
      streamId: current.streamId
    });
    update.projectId = context.projectId;
    update.streamId = context.streamId;
  }

  await db
    .update(tasks)
    .set(update)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

  return getTaskForUser(db, userId, taskId);
}

function taskCalendarStart(task: ApiTask) {
  if (task.timeBlock) {
    return task.timeBlock.startsAt;
  }

  if (!task.dueDate) {
    return null;
  }

  return startOfMoscowDate(task.dueDate).toISOString();
}

function taskCalendarEnd(task: ApiTask) {
  if (task.timeBlock) {
    return task.timeBlock.endsAt;
  }

  return null;
}

export async function getCalendarPlanForUser(
  db: Db,
  userId: string,
  input: CalendarPlanInput
) {
  const from = normalizeDate(input.from);
  const to = normalizeDate(input.to);

  if (!from || !to || from > to) {
    throw new ApiServiceError("Calendar range must include from <= to");
  }

  await ensureRecurringTaskInstances(db, userId, from, to);

  const taskRows = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(streams, eq(tasks.streamId, streams.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, ["open", "done"]),
        gte(tasks.dueDate, from),
        lte(tasks.dueDate, to)
      )
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.dayPriority), asc(tasks.createdAt));

  const eventRows = await db
    .select({
      calendarName: connectedCalendars.name,
      endsAt: calendarEvents.endsAt,
      eventUrl: calendarEvents.eventUrl,
      id: calendarEvents.id,
      isAllDay: calendarEvents.isAllDay,
      location: calendarEvents.location,
      startsAt: calendarEvents.startsAt,
      title: calendarEvents.title
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
        gte(calendarEvents.startsAt, startOfMoscowDate(from)),
        lte(calendarEvents.startsAt, endOfMoscowDate(to))
      )
    )
    .orderBy(asc(calendarEvents.startsAt));

  const taskItems: ApiCalendarItem[] = taskRows
    .map(serializeTask)
    .flatMap((task) => {
      const start = taskCalendarStart(task);

      if (!start) {
        return [];
      }

      return {
        id: `task-${task.id}`,
        kind: "task" as const,
        title: task.title,
        start,
        end: taskCalendarEnd(task),
        allDay: task.timeBlock === null,
        editable: true as const,
        task
      };
    });

  const eventItems: ApiCalendarItem[] = eventRows.map((event) => ({
    id: `calendar-event-${event.id}`,
    kind: "calendar-event",
    title: event.title,
    start: event.startsAt.toISOString(),
    end: event.endsAt.toISOString(),
    allDay: event.isAllDay,
    editable: false,
    location: event.location,
    eventUrl: event.eventUrl,
    sourceLabel: event.calendarName
  }));

  return {
    from,
    to,
    items: [...taskItems, ...eventItems].sort((left, right) =>
      left.start.localeCompare(right.start)
    )
  };
}

export function createTimeBlockFromDateAndTimes(input: {
  dueDate: string;
  endTime: string;
  startTime: string;
}): TaskTimeBlockInput {
  const dueDate = normalizeDate(input.dueDate);

  if (!dueDate) {
    throw new ApiServiceError("dueDate is required for time blocks");
  }

  const startsAt = combineDateAndTime(dueDate, input.startTime);
  const endsAt = combineDateAndTime(dueDate, input.endTime);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new ApiServiceError("Time block must use HH:mm startTime and endTime");
  }

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString()
  };
}
