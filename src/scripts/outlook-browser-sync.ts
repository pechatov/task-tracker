import { setTimeout } from "node:timers/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import {
  fetchMicrosoftCalendarEvents,
  fetchMicrosoftCalendars,
  fetchMicrosoftProfile
} from "../lib/calendar/microsoft";
import {
  importBrowserSessionCalendarEvents,
  mapMicrosoftEvent
} from "../lib/calendar/sync";
import type { CalendarEventSnapshot } from "../lib/calendar/types";
import { closeDbPool } from "../db/with-db";

type SyncOptions = {
  calendarUrl: string;
  headless: boolean;
  pollMs: number;
  profileDir: string;
  runOnce: boolean;
  userEmail: string;
};

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readOptions(): SyncOptions {
  const pollSeconds = Number.parseInt(
    process.env.OUTLOOK_BROWSER_SYNC_SECONDS ?? "600",
    10
  );

  if (!Number.isFinite(pollSeconds) || pollSeconds < 30) {
    throw new Error("OUTLOOK_BROWSER_SYNC_SECONDS must be at least 30");
  }

  return {
    calendarUrl:
      process.env.OUTLOOK_BROWSER_CALENDAR_URL?.trim() ||
      "https://outlook.office.com/calendar/",
    headless: process.env.OUTLOOK_BROWSER_HEADLESS === "1",
    pollMs: pollSeconds * 1000,
    profileDir:
      process.env.OUTLOOK_BROWSER_PROFILE_DIR?.trim() ||
      ".local/outlook-browser-profile",
    runOnce: process.argv.includes("--once"),
    userEmail: readRequiredEnv("OUTLOOK_BROWSER_USER_EMAIL")
  };
}

function captureGraphToken(context: BrowserContext) {
  let token: string | null = null;

  context.on("request", (request) => {
    if (!request.url().includes("graph.microsoft.com")) {
      return;
    }

    const authorization = request.headers().authorization;

    if (authorization?.startsWith("Bearer ")) {
      token = authorization.slice("Bearer ".length);
    }
  });

  return {
    clear: () => {
      token = null;
    },
    get: () => token
  };
}

async function openOutlookCalendar(page: Page, calendarUrl: string) {
  await page.goto(calendarUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });
}

async function waitForGraphToken(params: {
  getToken: () => string | null;
  page: Page;
}) {
  const deadline = Date.now() + 10 * 60_000;
  let prompted = false;

  while (Date.now() < deadline) {
    const token = params.getToken();

    if (token) {
      return token;
    }

    if (!prompted) {
      console.info(
        "Waiting for Outlook Web login. Complete login and MFA in the opened browser window."
      );
      prompted = true;
    }

    await params.page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for a Microsoft Graph token from Outlook Web");
}

async function syncOnce(options: SyncOptions, token: string) {
  const profile = await fetchMicrosoftProfile({ accessToken: token });
  const accountEmail =
    profile.mail ?? profile.userPrincipalName ?? "outlook-browser-session";
  const calendars = await fetchMicrosoftCalendars(token);

  console.info("Outlook Browser calendars discovered", {
    accountEmail,
    count: calendars.length
  });

  for (const calendar of calendars) {
    const rawEvents = await fetchMicrosoftCalendarEvents(token, calendar.id);
    const events = rawEvents
      .map(mapMicrosoftEvent)
      .filter((event): event is CalendarEventSnapshot => event !== null);

    await importBrowserSessionCalendarEvents({
      accountEmail,
      calendarExternalId: `outlook-browser:${calendar.id}`,
      calendarName: calendar.name?.trim() || "Outlook Web",
      events,
      sourceDisplayName: profile.displayName
        ? `Outlook Web - ${profile.displayName}`
        : "Outlook Web",
      userEmail: options.userEmail
    });

    console.info("Outlook Browser calendar synced", {
      calendar: calendar.name,
      events: events.length
    });
  }
}

async function main() {
  const options = readOptions();
  const context = await chromium.launchPersistentContext(options.profileDir, {
    headless: options.headless
  });
  const tokenCapture = captureGraphToken(context);
  const page = context.pages()[0] ?? (await context.newPage());

  await openOutlookCalendar(page, options.calendarUrl);

  while (true) {
    tokenCapture.clear();

    const token = await waitForGraphToken({
      getToken: tokenCapture.get,
      page
    });

    await syncOnce(options, token);

    if (options.runOnce) {
      break;
    }

    await setTimeout(options.pollMs);
    await openOutlookCalendar(page, options.calendarUrl).catch(() => {});
  }

  await context.close();
  await closeDbPool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
