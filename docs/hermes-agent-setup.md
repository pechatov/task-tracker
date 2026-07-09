# Настройка Hermes Agent

Эта инструкция подключает Task Tracker к Hermes Agent через локальный MCP
stdio-сервер. Hermes сможет читать план календаря, читать задачи и создавать или
редактировать только задачи. Внешние календарные встречи остаются read-only.

Официальные страницы Hermes по MCP:

- <https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp>
- <https://hermes-agent.nousresearch.com/docs/guides/use-mcp-with-hermes>
- <https://hermes-agent.nousresearch.com/docs/reference/cli-commands>

## 1. Подготовить Task Tracker

На сервере или машине, где развернут Task Tracker:

```sh
cd /path/to/task-tracker
npm install
npm run db:migrate
npm run dev
```

Для локальной разработки запусти `npm run worker:dev` в другом терминале. В
production используй обычный deployment, где `app` и `worker` запущены вместе.
MCP-сервер обращается к REST API, поэтому ему не нужны доступ к Postgres, ключ
шифрования или session secret. Убедись, что URL приложения доступен с машины,
где работает Hermes.

## 2. Создать integration token

Создай токен для пользователя, от имени которого Hermes будет работать:

```sh
npm run integration-token:create -- \
  --email you@example.com \
  --name hermes \
  --scopes tasks:read,tasks:write,calendar:read,contexts:read
```

Команда выведет токен один раз:

```text
Token:
ttk_...
```

Сохрани его. В базе хранится только хеш токена.

Scopes:

- `tasks:read` - читать задачи.
- `tasks:write` - создавать и редактировать задачи.
- `calendar:read` - читать план календаря, включая read-only внешние встречи.
- `contexts:read` - читать стримы и проекты для назначения задачам.

Для read-only Hermes не выдавай `tasks:write`.

## 3. Проверить MCP-сервер вручную

Важно запускать через `npm --silent`: обычный `npm run` пишет служебный текст в
stdout, а stdio MCP требует, чтобы stdout содержал только JSON-RPC сообщения.

```sh
cd /path/to/task-tracker
TASK_TRACKER_API_BASE_URL=https://task-tracker.example.com \
TASK_TRACKER_INTEGRATION_TOKEN=ttk_... \
npm --silent run mcp:start
```

Если процесс запустился и просто ждет ввода, это нормально. Останови его через
`Ctrl+C`.

## 4. Добавить MCP server в Hermes

Открой конфиг Hermes:

```sh
$EDITOR ~/.hermes/config.yaml
```

Добавь сервер:

```yaml
mcp_servers:
  task_tracker:
    command: "bash"
    args:
      - "-lc"
      - "cd /path/to/task-tracker && npm --silent run mcp:start"
    env:
      TASK_TRACKER_API_BASE_URL: "https://task-tracker.example.com"
      TASK_TRACKER_INTEGRATION_TOKEN: "ttk_..."
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

Замени:

- `/path/to/task-tracker` на абсолютный путь к репозиторию.
- `https://task-tracker.example.com` на URL запущенного Task Tracker.
- `ttk_...` на токен из предыдущего шага.

Не добавляй в конфиг Hermes `DATABASE_URL`, `APP_ENCRYPTION_KEY` или
`AUTH_SESSION_SECRET`: MCP работает только через scoped REST API.

## 5. Запустить или перезагрузить Hermes

Новый чат:

```sh
hermes chat
```

Если Hermes уже запущен, можно попробовать reload MCP:

```text
/reload-mcp
```

Если reload не подхватил сервер, перезапусти Hermes полностью.

## 6. Проверить инструменты в Hermes

Сначала спроси у Hermes, видит ли он MCP-инструменты:

```text
Какие MCP tools доступны сейчас?
```

Ожидаемые инструменты:

- `list_calendar_items`
- `list_tasks`
- `list_contexts`
- `create_task`
- `update_task`
- `reschedule_task`
- `complete_task`

Затем проверь реальные сценарии:

```text
Используй task_tracker и покажи мои задачи с 2026-07-10 по 2026-07-16.
```

```text
Используй task_tracker и создай задачу "Подготовить отчет" на 2026-07-10
с 14:00 до 15:00.
```

```text
Используй task_tracker и перенеси эту задачу на 2026-07-10 с 16:30 до 17:45.
```

```text
Используй task_tracker и отметь эту задачу выполненной.
```

## 7. Read-only режим

Если Hermes должен только смотреть задачи и календарь:

1. Создай токен без `tasks:write`:

   ```sh
   npm run integration-token:create -- \
     --email you@example.com \
     --name hermes-readonly \
     --scopes tasks:read,calendar:read,contexts:read
   ```

2. В конфиге Hermes оставь только read tools:

   ```yaml
   tools:
     include:
       - list_calendar_items
       - list_tasks
       - list_contexts
     resources: false
     prompts: false
   ```

## Troubleshooting

### Hermes не видит tools

- Проверь YAML-отступы в `~/.hermes/config.yaml`.
- Перезапусти Hermes или выполни `/reload-mcp`.
- Проверь, что `enabled: true`.
- Проверь, что `command` и путь в `args` корректны.

### Ошибка protocol / JSON parse

Почти всегда причина в лишнем выводе в stdout. Убедись, что используется:

```sh
npm --silent run mcp:start
```

а не:

```sh
npm run mcp:start
```

### Tool возвращает `Missing required scope`

Токен не содержит нужный scope. Создай новый токен с нужными scopes и обнови
`TASK_TRACKER_INTEGRATION_TOKEN` в конфиге Hermes.

### MCP server не подключается к Task Tracker

- Проверь `TASK_TRACKER_API_BASE_URL` командой `curl` с машины Hermes.
- Проверь, что веб-приложение запущено и URL использует правильный протокол и
  порт.
- Для HTTPS проверь сертификат и сетевые правила между Hermes и приложением.

### Нужно проверить MCP без Hermes

Можно запустить локальный smoke-тест stdio:

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| TASK_TRACKER_API_BASE_URL=https://task-tracker.example.com \
  TASK_TRACKER_INTEGRATION_TOKEN=ttk_... \
  npm --silent run mcp:start
```

В ответе должен быть список tools.
