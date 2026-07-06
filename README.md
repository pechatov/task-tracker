# Task Tracker

Personal task and calendar tracker. The MVP is a single-user web/PWA app with user-scoped data, read-only calendar sync, and a worker process for background jobs.

## Local Requirements

- Node.js 26.x
- npm 11.x
- Docker + Docker Compose for local Postgres

On CachyOS/Arch-like systems, Docker and PostgreSQL client tools can be installed with:

```sh
sudo pacman -S docker docker-compose postgresql-libs
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and back in after adding the Docker group.

## Setup

```sh
npm install
cp .env.example .env
```

Generate secure local secrets:

```sh
openssl rand -base64 32
openssl rand -base64 48
```

Put the first value into `APP_ENCRYPTION_KEY` and the second into `AUTH_SESSION_SECRET`.

Start Postgres:

```sh
docker compose up -d postgres
```

Generate and run migrations:

```sh
npm run db:generate
npm run db:migrate
```

Create the first user:

```sh
npm run user:create -- --email you@example.com
```

Run the app:

```sh
npm run dev
```

Run the worker in another terminal:

```sh
npm run worker:dev
```

## Outlook Web Browser Sync

When Microsoft Graph app registration is unavailable, a local browser-session bridge can reuse an interactive Outlook Web login. It stores the browser profile under `.local/`, waits for you to complete login and MFA in the opened browser window, captures the Microsoft Graph token used by Outlook Web, and imports read-only calendar events into the tracker.

Configure the tracker user email:

```sh
OUTLOOK_BROWSER_USER_EMAIL=you@example.com npm run outlook:browser-sync
```

For one manual sync pass:

```sh
OUTLOOK_BROWSER_USER_EMAIL=you@example.com npm run outlook:browser-sync -- --once
```

This is a fragile local workaround. If Outlook Web stops issuing a usable Graph token to the page, the bridge will fail and the supported alternatives are Microsoft app registration, Exchange app password/EWS, or an ICS/CalDAV feed.

## macOS Calendar Bridge

If Exchange events are already visible in Apple Calendar, use the macOS EventKit bridge instead of browser-session scraping. Configure the server with a long random import token:

```sh
LOCAL_CALENDAR_IMPORT_TOKEN=<long random token>
LOCAL_CALENDAR_IMPORT_USER_EMAIL=you@example.com
```

On the Mac, run a one-off calendar list:

```sh
TASK_TRACKER_BASE_URL=http://localhost:3001 \
LOCAL_CALENDAR_IMPORT_TOKEN=<same token> \
TASK_TRACKER_USER_EMAIL=you@example.com \
MACOS_CALENDAR_LIST=1 \
swift scripts/macos-calendar-bridge/MacosCalendarBridge.swift
```

Then sync all matching calendars:

```sh
TASK_TRACKER_BASE_URL=http://localhost:3001 \
LOCAL_CALENDAR_IMPORT_TOKEN=<same token> \
TASK_TRACKER_USER_EMAIL=you@example.com \
MACOS_CALENDAR_ACCOUNT_EMAIL=work@example.com \
MACOS_CALENDAR_NAME_CONTAINS=Work \
swift scripts/macos-calendar-bridge/MacosCalendarBridge.swift
```

By default the bridge skips events where the current user has not accepted the invite and events without any participant other than the current user. Set `MACOS_CALENDAR_INCLUDE_UNACCEPTED=1` or `MACOS_CALENDAR_INCLUDE_SOLO_EVENTS=1` to disable those filters for a run.

For periodic sync, adapt `scripts/macos-calendar-bridge/com.tasktracker.calendar-bridge.plist.example`, put it into `~/Library/LaunchAgents/`, then run:

```sh
launchctl load ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
```

## Checks

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

## Product Notes

- Domain language lives in [CONTEXT.md](./CONTEXT.md).
- MVP scope lives in [docs/mvp-plan.md](./docs/mvp-plan.md).
- Architecture decisions live in [docs/adr](./docs/adr).
