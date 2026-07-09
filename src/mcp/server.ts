import "dotenv/config";
import readline from "node:readline";
import { z } from "zod";
import {
  createTimeBlockFromDateAndTimes,
  type CreateTaskInput,
  type UpdateTaskInput
} from "../lib/api/task-service";

const protocolVersion = "2025-11-25";
const integrationToken = process.env.TASK_TRACKER_INTEGRATION_TOKEN?.trim() || null;
const apiBaseUrl = process.env.TASK_TRACKER_API_BASE_URL?.trim() || null;
const apiTimeoutMs = 30_000;

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
  .strict()
  .superRefine((input, context) => {
    if (
      (input.startTime === undefined) !== (input.endTime === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Both startTime and endTime are required"
      });
    }
  });

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
      dependentRequired: {
        startTime: ["endTime"],
        endTime: ["startTime"]
      },
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

function getApiUrl(path: string) {
  if (!apiBaseUrl) {
    throw new Error("TASK_TRACKER_API_BASE_URL is required");
  }

  try {
    return new URL(path, apiBaseUrl);
  } catch {
    throw new Error("TASK_TRACKER_API_BASE_URL must be a valid URL");
  }
}

async function requestApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!integrationToken) {
    throw new Error("TASK_TRACKER_INTEGRATION_TOKEN is required");
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${integrationToken}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(getApiUrl(path), {
    ...init,
    headers,
    signal: AbortSignal.timeout(apiTimeoutMs)
  });
  const body = await response.text();
  let payload: unknown = null;

  if (body) {
    try {
      payload = JSON.parse(body);
    } catch {
      payload = body;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Task Tracker API returned ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
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
        const query = new URLSearchParams({
          from: input.from,
          to: input.to
        });
        const result = await requestApi<unknown>(
          `/api/v1/calendar?${query.toString()}`
        );
        return toolSuccess(result);
      }
      case "list_tasks": {
        const input = listTasksSchema.parse(args ?? {});
        const query = new URLSearchParams({
          includeBacklog: String(input.includeBacklog),
          status: input.status
        });

        if (input.from) {
          query.set("from", input.from);
        }

        if (input.to) {
          query.set("to", input.to);
        }

        const result = await requestApi<unknown>(
          `/api/v1/tasks?${query.toString()}`
        );
        return toolSuccess(result);
      }
      case "list_contexts": {
        z.object({}).strict().parse(args ?? {});
        const result = await requestApi<unknown>("/api/v1/contexts");
        return toolSuccess(result);
      }
      case "create_task": {
        const input = normalizeTaskMutation(createTaskSchema.parse(args ?? {}));
        const result = await requestApi<unknown>("/api/v1/tasks", {
          method: "POST",
          body: JSON.stringify(input)
        });
        return toolSuccess(result);
      }
      case "update_task": {
        const { taskId, ...input } = normalizeTaskMutation(
          updateTaskSchema.parse(args ?? {})
        );
        const result = await requestApi<unknown>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(input)
          }
        );
        return toolSuccess(result);
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
        const result = await requestApi<unknown>(
          `/api/v1/tasks/${encodeURIComponent(input.taskId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(update)
          }
        );
        return toolSuccess(result);
      }
      case "complete_task": {
        const input = taskIdSchema.parse(args ?? {});
        const result = await requestApi<unknown>(
          `/api/v1/tasks/${encodeURIComponent(input.taskId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: "done" })
          }
        );
        return toolSuccess(result);
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
      const parsedParams = z
        .object({
          name: z.string(),
          arguments: z.unknown().optional()
        })
        .safeParse(message.params ?? {});

      if (!parsedParams.success) {
        failure(message.id, -32602, "Invalid tools/call params");
        return;
      }

      const params = parsedParams.data;
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
let requestQueue = Promise.resolve();

async function processLine(line: string) {
  let message: JsonRpcRequest;

  try {
    const parsed = JSON.parse(line) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      failure(null, -32600, "Invalid JSON-RPC message");
      return;
    }

    message = parsed as JsonRpcRequest;
  } catch {
    failure(null, -32700, "Parse error");
    return;
  }

  try {
    await handleRequest(message);
  } catch (error) {
    failure(message.id, -32603, "Internal error");
    console.error(error);
  }
}

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  requestQueue = requestQueue.then(() => processLine(line));
});

rl.on("close", () => {
  void requestQueue.finally(() => process.exit(0));
});
