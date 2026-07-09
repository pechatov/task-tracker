# External Integrations

External applications can read the planning calendar and create or edit tasks.
External calendar events are read-only: integrations can see them in the
calendar plan, but cannot mutate provider events.

## Token

Create an integration token for an existing user:

```sh
npm run integration-token:create -- \
  --email you@example.com \
  --name hermes \
  --scopes tasks:read,tasks:write,calendar:read,contexts:read
```

The command prints the token once. Store it in the external application. The
database stores only a token hash.

Available scopes:

- `tasks:read`
- `tasks:write`
- `calendar:read`
- `contexts:read`

Use the token with REST API requests:

```sh
Authorization: Bearer <token>
```

## REST API

### List Calendar Items

```sh
curl -H "Authorization: Bearer <token>" \
  "https://task-tracker.example.com/api/v1/calendar?from=2026-07-09&to=2026-07-16"
```

The response contains mixed items:

- `kind: "task"` with `editable: true`
- `kind: "calendar-event"` with `editable: false`

The inclusive `from`/`to` range is limited to 93 days and 2,000 returned items.
The endpoint is read-only; the background worker maintains generated
recurring-task instances.

### List Tasks

```sh
curl -H "Authorization: Bearer <token>" \
  "https://task-tracker.example.com/api/v1/tasks?from=2026-07-09&to=2026-07-16&status=open"
```

### Create A Task

Date-only task:

```sh
curl -X POST "https://task-tracker.example.com/api/v1/tasks" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Prepare weekly report",
    "dueDate": "2026-07-10",
    "size": "medium"
  }'
```

Task with a calendar slot:

```sh
curl -X POST "https://task-tracker.example.com/api/v1/tasks" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Prepare weekly report",
    "timeBlock": {
      "startsAt": "2026-07-10T14:00:00+03:00",
      "endsAt": "2026-07-10T15:00:00+03:00"
    }
  }'
```

### Update A Task

```sh
curl -X PATCH "https://task-tracker.example.com/api/v1/tasks/<task-id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "done"
  }'
```

To remove a calendar slot while keeping the task on its date:

```json
{
  "timeBlock": null
}
```

### List Contexts

Use this before assigning `streamId` or `projectId`:

```sh
curl -H "Authorization: Bearer <token>" \
  "https://task-tracker.example.com/api/v1/contexts"
```

## MCP Server

The MCP server is a separate stdio process and a thin client for the REST API.
It does not need database or application-secret credentials.

Start it from the repo:

```sh
TASK_TRACKER_API_BASE_URL=https://task-tracker.example.com \
TASK_TRACKER_INTEGRATION_TOKEN=<token> \
npm --silent run mcp:start
```

Example MCP stdio configuration:

```json
{
  "mcpServers": {
    "task-tracker": {
      "command": "npm",
      "args": ["--silent", "run", "mcp:start"],
      "cwd": "/path/to/task-tracker",
      "env": {
        "TASK_TRACKER_API_BASE_URL": "https://task-tracker.example.com",
        "TASK_TRACKER_INTEGRATION_TOKEN": "<token>"
      }
    }
  }
}
```

The server exposes these tools:

- `list_calendar_items`
- `list_tasks`
- `list_contexts`
- `create_task`
- `update_task`
- `reschedule_task`
- `complete_task`

## Hermes Agent Setup

Hermes Agent reads MCP servers from `~/.hermes/config.yaml` under
`mcp_servers`. The task tracker MCP server is a local stdio server, so configure
it with `command`, `args`, and `env`.

1. Deploy and start the app version that contains the integration API, then run
   migrations:

   ```sh
   npm run db:migrate
   ```

2. Create a token for the user Hermes should operate as:

   ```sh
   npm run integration-token:create -- \
     --email you@example.com \
     --name hermes \
     --scopes tasks:read,tasks:write,calendar:read,contexts:read
   ```

3. Check the MCP server starts cleanly. Use `npm --silent`; normal `npm run`
   prints npm banners to stdout, which breaks stdio MCP:

   ```sh
   cd /path/to/task-tracker
   TASK_TRACKER_API_BASE_URL=https://task-tracker.example.com \
   TASK_TRACKER_INTEGRATION_TOKEN=<token> \
   npm --silent run mcp:start
   ```

   Stop it with `Ctrl+C` after verifying it waits for MCP input.

4. Add the server to `~/.hermes/config.yaml`:

   ```yaml
   mcp_servers:
     task_tracker:
       command: "bash"
       args:
         - "-lc"
         - "cd /path/to/task-tracker && npm --silent run mcp:start"
       env:
         TASK_TRACKER_API_BASE_URL: "https://task-tracker.example.com"
         TASK_TRACKER_INTEGRATION_TOKEN: "<token>"
       enabled: true
       timeout: 120
       connect_timeout: 60
       supports_parallel_tool_calls: false
       tools:
         include:
           - list_calendar_items
           - list_tasks
           - list_contexts
           - create_task
           - update_task
           - reschedule_task
           - complete_task
         resources: false
         prompts: false
   ```

   `TASK_TRACKER_API_BASE_URL` must be reachable from the machine where Hermes
   runs. Do not pass `DATABASE_URL`, encryption keys, or session secrets to the
   MCP process.

5. Start a new Hermes session:

   ```sh
   hermes chat
   ```

6. Test the integration from Hermes with small explicit requests:

   ```text
   Use task_tracker to list my tasks from 2026-07-10 to 2026-07-16.
   ```

   ```text
   Use task_tracker to create a task named "Prepare report" on 2026-07-10
   from 14:00 to 15:00.
   ```

   ```text
   Use task_tracker to move that task to 2026-07-10 from 16:30 to 17:45.
   ```

For a read-only Hermes setup, create a token without `tasks:write` and expose
only read tools:

```yaml
tools:
  include:
    - list_calendar_items
    - list_tasks
    - list_contexts
  resources: false
  prompts: false
```

Troubleshooting:

- If Hermes shows no tools, check YAML indentation and restart the Hermes
  session; MCP tools are discovered at startup.
- If Hermes reports a protocol or parse error, make sure the config uses
  `npm --silent run mcp:start`.
- If tool calls return `Missing required scope`, create a new integration token
  with the required scope and update `TASK_TRACKER_INTEGRATION_TOKEN`.
- If tool calls cannot reach Task Tracker, check `TASK_TRACKER_API_BASE_URL`,
  TLS, firewall rules, and whether the web app is running.
