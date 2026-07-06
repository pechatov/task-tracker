---
name: verify
description: How to build, run, and drive this app to verify changes end-to-end
---

# Verifying task-tracker changes

## Build & run

- Postgres: `docker compose up -d` (compose.yaml, exposes 5432); check `docker ps` first — it is usually already running.
- Migrations: `npm run db:migrate` (reads `.env`, which exists locally with working values).
- The user often has `next dev` running on port 3000 — do not kill it. Run your own server on another port: `npm run build && PORT=3001 npm start`.

## Test user

`npm run user:create` reads the password interactively and hangs on piped stdin. Instead insert directly with a throwaway tsx script (must live inside the repo dir so node_modules resolve) using `argon2.hash(password, { type: argon2id })` into `users`. Delete the user afterwards — cascades remove sessions, calendar sources, calendars, and events.

## Driving the UI

`@playwright/test` is a dev dependency and chromium is already in `~/.cache/ms-playwright`. Scripts must be run from inside the repo dir for module resolution. Login form is at `/login` (`input[name=email]`, `input[name=password]`); after submit wait for URL to leave `/login` — server actions navigate slowly, a bare `waitForURL("**")` matches too early.

Key flows: `/settings` (calendar connect forms + source list + resync/disconnect buttons), `/calendar` (FullCalendar day/week/month; week view only shows the current week — navigate with the arrow next to "Сегодня" or switch to Month to see events on other dates), `/` (today board).

## Mocking calendar providers

Exchange (EWS): point the settings form at a local HTTP mock of `POST /EWS/Exchange.asmx`. It must handle Basic auth and three SOAP ops distinguished by body substring: `<m:FindFolder` (list of `t:CalendarFolder` with `FolderId`/`DisplayName`), `<m:GetFolder` (default calendar folder id), `<m:FindItem` (CalendarItem list; folder id is in `ParentFolderIds`, sync window in `CalendarView StartDate/EndDate`). The form accepts a bare `http://127.0.0.1:PORT` URL and appends `/EWS/Exchange.asmx` itself. Event times are UTC; the UI renders them in local time.

Yandex (CalDAV) needs a full DAV server — harder to mock; prefer checking `calendar_events` rows in Postgres for data-level assertions: `docker exec task-tracker-postgres-1 psql -U task_tracker -d task_tracker -c "..."`.

## Gotchas

- Failed connect form submissions render the generic Next.js "server error" page — that is current behavior, not a regression.
- The session cookie is `secure: true` under `npm start`; Chromium accepts it on localhost, plain curl flows need `-k`-style care.
