# macOS Calendar Bridge

Use this bridge when Exchange events are visible in Apple Calendar, but Microsoft Graph app registration is unavailable. The bridge reads local macOS EventKit calendar data and imports read-only events into Task Tracker. It does not store Exchange credentials or MFA secrets.

## Server Configuration

Set these variables in the production Task Tracker environment:

```sh
LOCAL_CALENDAR_IMPORT_TOKEN=<long random token>
LOCAL_CALENDAR_IMPORT_USER_EMAIL=<task-tracker-user-email>
```

Generate the token with:

```sh
openssl rand -base64 32
```

The token is a stable shared secret. It does not need to change on each deploy as long as the production environment/secrets are preserved. Rotate it only if it is lost, leaked, or you want to revoke the current Mac bridge.

After changing server env, deploy the app, run migrations, and restart the app/worker. The bridge posts to:

```text
POST /api/calendar/import/local
Authorization: Bearer <LOCAL_CALENDAR_IMPORT_TOKEN>
```

## Manual Mac Setup

Make sure the Exchange calendar is visible in Apple Calendar.app. Then copy or checkout this repo on the Mac.

List available calendars:

```sh
TASK_TRACKER_BASE_URL=https://task-tracker.example.com \
LOCAL_CALENDAR_IMPORT_TOKEN=<same-token-as-server> \
TASK_TRACKER_USER_EMAIL=<task-tracker-user-email> \
MACOS_CALENDAR_LIST=1 \
swift scripts/macos-calendar-bridge/MacosCalendarBridge.swift
```

macOS asks for Calendar access on first run. Allow it. Pick the target calendar name/source from the output.

Run a manual sync:

```sh
TASK_TRACKER_BASE_URL=https://task-tracker.example.com \
LOCAL_CALENDAR_IMPORT_TOKEN=<same-token-as-server> \
TASK_TRACKER_USER_EMAIL=<task-tracker-user-email> \
MACOS_CALENDAR_ACCOUNT_EMAIL=<corporate-email> \
MACOS_CALENDAR_NAME_CONTAINS=<part-of-calendar-name> \
swift scripts/macos-calendar-bridge/MacosCalendarBridge.swift
```

`TASK_TRACKER_BASE_URL` must be the normal HTTPS production app URL. For local LAN testing it can be something like `http://192.168.1.192:3002`.

## Import Filters

By default the bridge skips:

- events where the current user has not accepted the invite;
- events where the current user cannot be identified among attendees or organizer;
- events without any participant other than the current user.

For diagnostics:

```sh
MACOS_CALENDAR_DEBUG_FILTERS=1
```

Emergency overrides for one run:

```sh
MACOS_CALENDAR_INCLUDE_UNACCEPTED=1
MACOS_CALENDAR_INCLUDE_SOLO_EVENTS=1
```

## Regular Sync With launchd

Copy the example plist and edit paths/env values:

```sh
mkdir -p ~/Library/LaunchAgents
cp scripts/macos-calendar-bridge/com.tasktracker.calendar-bridge.plist.example \
  ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
open -e ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
```

In the plist, set:

- repo absolute path in `ProgramArguments`;
- `TASK_TRACKER_BASE_URL=https://task-tracker.example.com`;
- `TASK_TRACKER_USER_EMAIL=<task-tracker-user-email>`;
- `LOCAL_CALENDAR_IMPORT_TOKEN=<same-token-as-server>`;
- `MACOS_CALENDAR_ACCOUNT_EMAIL=<corporate-email>`;
- optional `MACOS_CALENDAR_NAME_CONTAINS=<part-of-calendar-name>`.

Load it:

```sh
launchctl load ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
```

Useful commands:

```sh
launchctl list | grep tasktracker
launchctl unload ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
tail -f /tmp/tasktracker-calendar-bridge.out.log
tail -f /tmp/tasktracker-calendar-bridge.err.log
```

The example uses `StartInterval=600`, so the Mac syncs every 10 minutes while the user session is running.

## Token Rotation

To rotate the import token:

1. Generate a new token.
2. Update `LOCAL_CALENDAR_IMPORT_TOKEN` on the server.
3. Restart the app.
4. Update `LOCAL_CALENDAR_IMPORT_TOKEN` in the Mac launchd plist.
5. Reload the launch agent:

```sh
launchctl unload ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
launchctl load ~/Library/LaunchAgents/com.tasktracker.calendar-bridge.plist
```
