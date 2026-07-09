import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

type JsonRpcResponse = {
  id: number;
  result?: {
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

describe("MCP server", () => {
  it("handles initialize and tools/list over clean stdio JSON-RPC", async () => {
    const child = spawn("npm", ["--silent", "run", "mcp:start"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TASK_TRACKER_INTEGRATION_TOKEN: "ttk_dummy"
      },
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

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0" }
        }
      })}\n`
    );
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized"
      })}\n`
    );
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })}\n`
    );
    child.stdin.end();

    const [exitCode] = await once(child, "exit");

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const responses = collectJsonRpcResponses(stdout);
    expect(responses.map((response) => response.id)).toEqual([1, 2]);
    expect(responses[1].result?.tools?.map((tool) => tool.name)).toEqual([
      "list_calendar_items",
      "list_tasks",
      "list_contexts",
      "create_task",
      "update_task",
      "reschedule_task",
      "complete_task"
    ]);
  });
});
