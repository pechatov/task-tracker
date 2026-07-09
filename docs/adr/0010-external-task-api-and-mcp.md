# External task API and MCP adapter

External applications need to read the planning calendar and create or edit
tasks, including tasks with time blocks. External calendar events still come
from connected calendar sources and must remain read-only.

We will expose a scoped REST API as the stable integration contract and provide
a separate stdio MCP server as an agent-facing adapter. Both surfaces use the
same task service layer and integration-token authorization, so business rules
do not fork between UI, HTTP clients, and MCP clients.

Integration tokens are user-scoped and carry explicit scopes:
`tasks:read`, `tasks:write`, `calendar:read`, and `contexts:read`. The write
scope applies only to tasks. Calendar plan reads can include external calendar
events, but those items are marked non-editable and no API route or MCP tool
updates provider events.

This keeps the public HTTP contract simple for normal clients while giving
Hermes-style agents a native tool interface. It also leaves room to add a
streamable HTTP MCP transport later without changing the task domain service.
