import "dotenv/config";
import readline from "node:readline";
import { z } from "zod";
import { createDb, createPgPool, type Db } from "../db/client";
import {
  createTaskForUser,
  createTimeBlockFromDateAndTimes,
  getCalendarPlanForUser,
  listContextsForUser,
  listTasksForUser,
  updateTaskForUser,
  type CreateTaskInput,
  type UpdateTaskInput
} from "../lib/api/task-service";
import {
  authenticateIntegrationToken,
  IntegrationAuthError,
  type IntegrationAuth
} from "../lib/integrations/auth";
import type { IntegrationTokenScope } from "../lib/integrations/tokens";

const protocolVersion = "2025-11-25";
const integrationToken = process.env.TASK_TRACKER_INTEGRATION_TOKEN?.trim() || null;

type JsonRpcId = number | string | null;

type JsonRpcRequest = {
  id?: JsonRpcId;
  jsonrpc?: "2.0";
  method?: string;
  params?: unknown;
};

type ToolDefinition = {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
  title: string;
};

type ToolResult = {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
  structuredContent?: unknown;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const taskStatusSchema = z.enum(["open", "done", "cancelled"]);
const taskSizeSchema = z.enum(["small", "medium", "big"]);
const timeBlockSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true })
});

const listTasksSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    status: z.enum(["all", "open", "done", "cancelled"]).default("all"),
    includeBacklog: z.boolean().default(true)
  })
  .strict();

const calendarRangeSchema = z
  .object({
    from: dateSchema,
    to: dateSchema
  })
  .strict();

const createTaskSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    dayPriority: z.number().int().min(1).optional(),
    status: taskStatusSchema.optional(),
    size: taskSizeSchema.optional(),
    streamId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    timeBlock: timeBlockSchema.nullable().optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
  })
  .strict();

const updateTaskSchema = createTaskSchema
  .omit({ title: true })
  .extend({
    taskId: z.string().uuid(),
    title: z.string().min(1).optional()
  })
  .strict();

const taskIdSchema = z
  .object({
    taskId: z.string().uuid()
  })
  .strict();

const rescheduleTaskSchema = z
  .object({
    taskId: z.string().uuid(),
    dueDate: dateSchema.nullable(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
  })
  .strict();

const tools: ToolDefinition[] = [
  {
    name: "list_calendar_items",
    title: "List Calendar Items",
    description:
      "Read the calendar plan for a date range. Tasks are editable; external calendar events are read-only.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", format: "date" },
        to: { type: "string", format: "date" }
      },
      required: ["from", "to"],
      additionalProperties: false
    }
  },
  {
    name: "list_tasks",
    title: "List Tasks",
    description: "Read tasks, optionally filtered by date range and status.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", format: "date" },
        to: { type: "string", format: "date" },
        status: {
          type: "string",
          enum: ["all", "open", "done", "cancelled"],
          default: "all"
        },
        includeBacklog: { type: "boolean", default: true }
      },
      additionalProperties: false
    }
  },
  {
    name: "list_contexts",
    title: "List Contexts",
    description: "Read active streams and projects that can be assigned to tasks.",
    inputSchema: {
      type: "object",
      additionalProperties: false
    }
  },
  {
    name: "create_task",
    title: "Create Task",
    description:
      "Create a task. To put it into a calendar slot, pass either timeBlock or dueDate with startTime and endTime.",
    inputSchema: taskMutationInputSchema(["title"])
  },
  {
    name: "update_task",
    title: "Update Task",
    description:
      "Edit a task. This cannot edit external calendar events. Pass timeBlock null to remove the slot.",
    inputSchema: taskMutationInputSchema(["taskId"])
  },
  {
    name: "reschedule_task",
    title: "Reschedule Task",
    description:
      "Move a task to a date or to a concrete calendar slot using dueDate plus optional startTime/endTime.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", format: "uuid" },
        dueDate: { type: ["string", "null"], format: "date" },
        startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
        endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" }
      },
      required: ["taskId", "dueDate"],
      additionalProperties: false
    }
  },
  {
    name: "complete_task",
    title: "Complete Task",
    description: "Mark a task as done.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", format: "uuid" }
      },
      required: ["taskId"],
      additionalProperties: false
    }
  }
];

function taskMutationInputSchema(required: string[]) {
  return {
    type: "object",
    properties: {
      taskId: { type: "string", format: "uuid" },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      dueDate: { type: ["string", "null"], format: "date" },
      dayPriority: { type: "integer", minimum: 1 },
      status: { type: "string", enum: ["open", "done", "cancelled"] },
      size: { type: "string", enum: ["small", "medium", "big"] },
      streamId: { type: ["string", "null"], format: "uuid" },
      projectId: { type: ["string", "null"], format: "uuid" },
      timeBlock: {
        anyOf: [
          {
            type: "object",
            properties: {
              startsAt: { type: "string", format: "date-time" },
              endsAt: { type: "string", format: "date-time" }
            },
            required: ["startsAt", "endsAt"],
            additionalProperties: false
          },
          { type: "null" }
        ]
      },
      startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
      endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" }
    },
    required,
    additionalProperties: false
  };
}

const pool = createPgPool();
const db = createDb(pool);

function writeMessage(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id: JsonRpcId | undefined, result: unknown) {
  if (id === undefined) {
    return;
  }

  writeMessage({ jsonrpc: "2.0", id, result });
}

function failure(id: JsonRpcId | undefined, code: number, message: string) {
  if (id === undefined) {
    return;
  }

  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function toolSuccess(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data
  };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : "Unknown tool error";

  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

async function withAuth<T>(
  requiredScopes: IntegrationTokenScope[],
  handler: (db: Db, auth: IntegrationAuth) => Promise<T>
) {
  if (!integrationToken) {
    throw new IntegrationAuthError(
      "TASK_TRACKER_INTEGRATION_TOKEN is required",
      401
    );
  }

  const auth = await authenticateIntegrationToken(
    db,
    integrationToken,
    requiredScopes
  );

  return handler(db, auth);
}

function normalizeTaskMutation<T extends CreateTaskInput | UpdateTaskInput>(
  input: T & {
    dueDate?: string | null;
    endTime?: string;
    startTime?: string;
    timeBlock?: T["timeBlock"];
  }
): T {
  const { endTime, startTime, ...taskInput } = input;

  if (taskInput.timeBlock !== undefined && (startTime || endTime)) {
    throw new Error("Use either timeBlock or startTime/endTime, not both");
  }

  if (taskInput.timeBlock === undefined && startTime && endTime) {
    if (!taskInput.dueDate) {
      throw new Error("dueDate is required when startTime/endTime are provided");
    }

    return {
      ...taskInput,
      timeBlock: createTimeBlockFromDateAndTimes({
        dueDate: taskInput.dueDate,
        startTime,
        endTime
      })
    } as unknown as T;
  }

  if ((startTime && !endTime) || (!startTime && endTime)) {
    throw new Error("Both startTime and endTime are required");
  }

  return taskInput as T;
}

async function callTool(name: string, args: unknown) {
  try {
    switch (name) {
      case "list_calendar_items": {
        const input = calendarRangeSchema.parse(args ?? {});
        const result = await withAuth(["calendar:read"], (db, auth) =>
          getCalendarPlanForUser(db, auth.user.id, input)
        );
        return toolSuccess(result);
      }
      case "list_tasks": {
        const input = listTasksSchema.parse(args ?? {});
        const result = await withAuth(["tasks:read"], (db, auth) =>
          listTasksForUser(db, auth.user.id, input)
        );
        return toolSuccess({ tasks: result });
      }
      case "list_contexts": {
        z.object({}).strict().parse(args ?? {});
        const result = await withAuth(["contexts:read"], (db, auth) =>
          listContextsForUser(db, auth.user.id)
        );
        return toolSuccess(result);
      }
      case "create_task": {
        const input = normalizeTaskMutation(createTaskSchema.parse(args ?? {}));
        const result = await withAuth(["tasks:write"], (db, auth) =>
          createTaskForUser(db, auth.user.id, input)
        );
        return toolSuccess({ task: result });
      }
      case "update_task": {
        const { taskId, ...input } = normalizeTaskMutation(
          updateTaskSchema.parse(args ?? {})
        );
        const result = await withAuth(["tasks:write"], (db, auth) =>
          updateTaskForUser(db, auth.user.id, taskId, input)
        );
        return toolSuccess({ task: result });
      }
      case "reschedule_task": {
        const input = rescheduleTaskSchema.parse(args ?? {});
        const update: UpdateTaskInput =
          input.startTime && input.endTime
            ? {
                dueDate: input.dueDate,
                timeBlock: createTimeBlockFromDateAndTimes({
                  dueDate: input.dueDate ?? "",
                  startTime: input.startTime,
                  endTime: input.endTime
                })
              }
            : { dueDate: input.dueDate, timeBlock: null };
        const result = await withAuth(["tasks:write"], (db, auth) =>
          updateTaskForUser(db, auth.user.id, input.taskId, update)
        );
        return toolSuccess({ task: result });
      }
      case "complete_task": {
        const input = taskIdSchema.parse(args ?? {});
        const result = await withAuth(["tasks:write"], (db, auth) =>
          updateTaskForUser(db, auth.user.id, input.taskId, { status: "done" })
        );
        return toolSuccess({ task: result });
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return toolError(error);
  }
}

async function handleRequest(message: JsonRpcRequest) {
  if (message.jsonrpc !== "2.0") {
    failure(message.id, -32600, "Invalid JSON-RPC message");
    return;
  }

  switch (message.method) {
    case "initialize":
      success(message.id, {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: "task-tracker",
          title: "Task Tracker",
          version: "0.1.0"
        },
        instructions:
          "Use task tools for writes. External calendar events returned by list_calendar_items are read-only."
      });
      return;
    case "notifications/initialized":
      return;
    case "ping":
      success(message.id, {});
      return;
    case "tools/list":
      success(message.id, { tools });
      return;
    case "tools/call": {
      const params = z
        .object({
          name: z.string(),
          arguments: z.unknown().optional()
        })
        .parse(message.params ?? {});
      success(message.id, await callTool(params.name, params.arguments));
      return;
    }
    default:
      failure(message.id, -32601, `Method not found: ${message.method ?? ""}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  void (async () => {
    try {
      await handleRequest(JSON.parse(line) as JsonRpcRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      failure(null, -32603, message);
      console.error(message);
    }
  })();
});

rl.on("close", () => {
  pool
    .end()
    .catch((error) => console.error(error))
    .finally(() => process.exit(0));
});
