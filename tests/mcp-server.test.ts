import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

type JsonRpcResponse = {
  id: number;
  error?: {
    code: number;
    message: string;
  };
  result?: {
    content?: Array<{ text: string }>;
    isError?: boolean;
    structuredContent?: unknown;
    tools?: Array<{ name: string }>;
  };
};

function collectJsonRpcResponses(output: string) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRpcResponse);
}

async function runMcp(
  messages: unknown[],
  env: Record<string, string> = {}
) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TASK_TRACKER_API_BASE_URL: "http://127.0.0.1:1",
    TASK_TRACKER_INTEGRATION_TOKEN: "ttk_dummy",
    ...env
  };
  delete childEnv.DATABASE_URL;
  delete childEnv.APP_ENCRYPTION_KEY;
  delete childEnv.AUTH_SESSION_SECRET;

  const child = spawn("npm", ["--silent", "run", "mcp:start"], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);

  const [exitCode] = await once(child, "exit");
  return {
    exitCode,
    responses: collectJsonRpcResponses(stdout),
    stderr
  };
}

describe("MCP server", () => {
  it("handles initialize and tools/list over clean stdio JSON-RPC", async () => {
    const result = await runMcp([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0" }
        }
      },
      {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      }
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.responses.map((response) => response.id)).toEqual([1, 2]);
    expect(result.responses[1].result?.tools?.map((tool) => tool.name)).toEqual([
      "list_calendar_items",
      "list_tasks",
      "list_contexts",
      "create_task",
      "update_task",
      "reschedule_task",
      "complete_task"
    ]);
  });

  it("keeps request ids on protocol errors and rejects partial time ranges", async () => {
    const taskId = "00000000-0000-4000-8000-000000000001";
    const result = await runMcp([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0" }
        }
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: 42, arguments: {} }
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "reschedule_task",
          arguments: {
            taskId,
            dueDate: "2026-07-10",
            startTime: "14:00"
          }
        }
      }
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.responses[1]).toMatchObject({
      id: 2,
      error: { code: -32602, message: "Invalid tools/call params" }
    });
    expect(result.responses[2]).toMatchObject({
      id: 3,
      result: { isError: true }
    });
    expect(result.responses[2].result?.content?.[0]?.text).toContain(
      "Both startTime and endTime are required"
    );
  });

  it("forwards task mutations to the REST API without database credentials", async () => {
    const requests: Array<{
      authorization: string | undefined;
      body: unknown;
      method: string | undefined;
      url: string | undefined;
    }> = [];
    const server = createServer((request, response) => {
      let body = "";

      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        requests.push({
          authorization: request.headers.authorization,
          body: body ? JSON.parse(body) : null,
          method: request.method,
          url: request.url
        });
        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ task: { id: "task-1" } }));
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;

    try {
      const result = await runMcp(
        [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "create_task",
              arguments: {
                title: "Prepare report",
                dueDate: "2026-07-10",
                startTime: "14:00",
                endTime: "15:00"
              }
            }
          }
        ],
        {
          TASK_TRACKER_API_BASE_URL: `http://127.0.0.1:${address.port}`,
          TASK_TRACKER_INTEGRATION_TOKEN: "ttk_rest_test"
        }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.responses[0]).toMatchObject({
        id: 1,
        result: { structuredContent: { task: { id: "task-1" } } }
      });
      expect(requests).toEqual([
        {
          authorization: "Bearer ttk_rest_test",
          method: "POST",
          url: "/api/v1/tasks",
          body: {
            title: "Prepare report",
            dueDate: "2026-07-10",
            timeBlock: {
              startsAt: "2026-07-10T11:00:00.000Z",
              endsAt: "2026-07-10T12:00:00.000Z"
            }
          }
        }
      ]);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
