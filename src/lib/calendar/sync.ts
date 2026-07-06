import { createHash } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import ICAL from "ical.js";
import {
  createDAVClient,
  type DAVCalendar,
  type DAVObject
} from "tsdav";
import { withDb } from "../../db/with-db";
import {
  calendarEvents,
  calendarSources,
  connectedCalendars,
  users
} from "../../db/schema";
import {
  decryptCalendarCredentials,
  encryptCalendarCredentials,
  type ExchangeCalendarCredentials,
  type GoogleCalendarCredentials,
  type MicrosoftGraphCalendarCredentials,
  type YandexCalendarCredentials
} from "./credentials";
import {
  fetchEwsCalendarFolders,
  fetchEwsCalendarItems,
  fetchEwsDefaultCalendarFolderId,
  normalizeEwsServerUrl,
  type EwsCalendarItem
} from "./ews";
import {
  fetchMicrosoftCalendarEvents,
  fetchMicrosoftCalendars,
  parseMicrosoftDateTime,
  refreshMicrosoftCalendarCredentials,
  type MicrosoftEvent
} from "./microsoft";
import { getCalendarSyncWindow } from "./sync-window";
import type {
  CalendarEventSnapshot,
  CalendarProvider,
  ConnectedCalendarSnapshot
} from "./types";
import { getEnv } from "../env";
import { CONTEXT_COLOR_PALETTE } from "../context/colors";

type Db = Parameters<Parameters<typeof withDb>[0]>[0];

type CalendarSourceRecord = typeof calendarSources.$inferSelect;

type ConnectedCalendarRecord = typeof connectedCalendars.$inferSelect;

type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleProfile = {
  email?: string;
  name?: string;
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  backgroundColor?: string;
  primary?: boolean;
  deleted?: boolean;
};

type GoogleEventDateTime = {
  date?: string;
  dateTime?: string;
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  location?: string;
  organizer?: {
    displayName?: string;
    email?: string;
  };
  attendees?: unknown[];
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: {
      entryPointType?: string;
      uri?: string;
    }[];
  };
  updated?: string;
};

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly"
];

const calendarColors = CONTEXT_COLOR_PALETTE;

export function getCalendarProviderLabel(provider: CalendarProvider) {
  switch (provider) {
    case "exchange_ews":
      return "Exchange";
    case "google_calendar":
      return "Google Календарь";
    case "yandex_caldav":
      return "Яндекс.Календарь";
    case "microsoft_graph":
      return "Microsoft 365";
    case "browser_session":
      return "Браузерная сессия";
    case "local_bridge":
      return "Локальный календарь";
    default:
      return provider;
  }
}

export function getGoogleAuthorizationUrl(state: string) {
  const env = getEnv();

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google calendar OAuth is not configured");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getGoogleRedirectUri());
  url.searchParams.set("scope", googleScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return url;
}

export function getGoogleRedirectUri() {
  return new URL("/api/calendar/google/callback", getEnv().APP_BASE_URL)
    .toString();
}

async function exchangeGoogleToken(params: Record<string, string>) {
  const env = getEnv();

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google calendar OAuth is not configured");
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    ...params
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeGoogleAuthorizationCode(code: string) {
  const token = await exchangeGoogleToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: getGoogleRedirectUri()
  });

  return googleCredentialsFromToken(token);
}

async function refreshGoogleCredentials(
  db: Db,
  source: CalendarSourceRecord,
  credentials: GoogleCalendarCredentials
) {
  if (
    credentials.expiresAt &&
    credentials.expiresAt > Date.now() + 60_000
  ) {
    return credentials;
  }

  if (!credentials.refreshToken) {
    return credentials;
  }

  const token = await exchangeGoogleToken({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken
  });
  const refreshed = googleCredentialsFromToken(token, credentials.refreshToken);
  const encrypted = encryptCalendarCredentials(refreshed);

  await db
    .update(calendarSources)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(calendarSources.id, source.id));

  return refreshed;
}

function googleCredentialsFromToken(
  token: GoogleTokenResponse,
  fallbackRefreshToken?: string
): GoogleCalendarCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? fallbackRefreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    scope: token.scope,
    tokenType: token.token_type
  };
}

async function fetchGoogleJson<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Google API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchGoogleProfile(
  credentials: GoogleCalendarCredentials
) {
  return fetchGoogleJson<GoogleProfile>(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    credentials.accessToken
  );
}

function colorFromString(value: string) {
  const hash = createHash("sha1").update(value).digest();
  return calendarColors[hash[0] % calendarColors.length];
}

function normalizeCalendarColor(value: string | undefined, fallback: string) {
  if (value && /^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  return colorFromString(fallback);
}

function calendarDisplayName(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function upsertConnectedCalendars(
  db: Db,
  source: CalendarSourceRecord,
  snapshots: ConnectedCalendarSnapshot[]
) {
  if (snapshots.length === 0) {
    return [];
  }

  for (const snapshot of snapshots) {
    await db
      .insert(connectedCalendars)
      .values({
        userId: source.userId,
        sourceId: source.id,
        externalCalendarId: snapshot.externalCalendarId,
        name: snapshot.name,
        color: snapshot.color,
        isEnabled: true,
        isPrimary: snapshot.isPrimary
      })
      .onConflictDoUpdate({
        target: [
          connectedCalendars.sourceId,
          connectedCalendars.externalCalendarId
        ],
        set: {
          name: snapshot.name,
          color: snapshot.color,
          isPrimary: snapshot.isPrimary,
          updatedAt: new Date()
        }
      });
  }

  return db
    .select()
    .from(connectedCalendars)
    .where(eq(connectedCalendars.sourceId, source.id))
    .orderBy(asc(connectedCalendars.name));
}

function contentHash(snapshot: CalendarEventSnapshot) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        title: snapshot.title,
        startsAt: snapshot.startsAt.toISOString(),
        endsAt: snapshot.endsAt.toISOString(),
        isAllDay: snapshot.isAllDay,
        location: snapshot.location,
        organizer: snapshot.organizer,
        attendeesSummary: snapshot.attendeesSummary,
        eventUrl: snapshot.eventUrl,
        providerUpdatedAt: snapshot.providerUpdatedAt?.toISOString()
      })
    )
    .digest("hex");
}

async function replaceCalendarEvents(
  db: Db,
  source: CalendarSourceRecord,
  calendar: ConnectedCalendarRecord,
  snapshots: CalendarEventSnapshot[]
) {
  const syncWindow = getCalendarSyncWindow();

  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.connectedCalendarId, calendar.id),
        gte(calendarEvents.startsAt, syncWindow.startsAt),
        lte(calendarEvents.startsAt, syncWindow.endsAt)
      )
    );

  if (snapshots.length === 0) {
    return;
  }

  for (const snapshot of snapshots) {
    await db
      .insert(calendarEvents)
      .values({
        userId: source.userId,
        sourceId: source.id,
        connectedCalendarId: calendar.id,
        externalEventId: snapshot.externalEventId,
        title: snapshot.title,
        startsAt: snapshot.startsAt,
        endsAt: snapshot.endsAt,
        isAllDay: snapshot.isAllDay,
        location: snapshot.location,
        organizer: snapshot.organizer,
        attendeesSummary: snapshot.attendeesSummary,
        eventUrl: snapshot.eventUrl,
        providerUpdatedAt: snapshot.providerUpdatedAt,
        contentHash: contentHash(snapshot)
      })
      .onConflictDoUpdate({
        target: [
          calendarEvents.connectedCalendarId,
          calendarEvents.externalEventId
        ],
        set: {
          title: snapshot.title,
          startsAt: snapshot.startsAt,
          endsAt: snapshot.endsAt,
          isAllDay: snapshot.isAllDay,
          location: snapshot.location,
          organizer: snapshot.organizer,
          attendeesSummary: snapshot.attendeesSummary,
          eventUrl: snapshot.eventUrl,
          providerUpdatedAt: snapshot.providerUpdatedAt,
          contentHash: contentHash(snapshot),
          updatedAt: new Date()
        }
      });
  }
}

function parseGoogleEventDateTime(value: GoogleEventDateTime | undefined) {
  if (value?.dateTime) {
    const date = new Date(value.dateTime);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value?.date) {
    const date = new Date(`${value.date}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function googleEventUrl(event: GoogleEvent) {
  if (event.hangoutLink) {
    return event.hangoutLink;
  }

  const videoEntryPoint = event.conferenceData?.entryPoints?.find(
    (entryPoint) => entryPoint.entryPointType === "video" && entryPoint.uri
  );

  return videoEntryPoint?.uri ?? event.htmlLink;
}

function mapGoogleEvent(event: GoogleEvent): CalendarEventSnapshot | null {
  if (event.status === "cancelled") {
    return null;
  }

  const startsAt = parseGoogleEventDateTime(event.start);
  const endsAt = parseGoogleEventDateTime(event.end);

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return null;
  }

  return {
    externalEventId: event.id,
    title: event.summary?.trim() || "Без названия",
    startsAt,
    endsAt,
    isAllDay: Boolean(event.start?.date),
    location: event.location,
    organizer: event.organizer?.displayName ?? event.organizer?.email,
    attendeesSummary: event.attendees?.length
      ? `${event.attendees.length} участников`
      : undefined,
    eventUrl: googleEventUrl(event),
    providerUpdatedAt: event.updated ? new Date(event.updated) : undefined
  };
}

async function fetchGoogleCalendars(accessToken: string) {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList"
    );
    url.searchParams.set("maxResults", "250");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const page = await fetchGoogleJson<{
      items?: GoogleCalendarListEntry[];
      nextPageToken?: string;
    }>(url.toString(), accessToken);

    calendars.push(...(page.items ?? []).filter((item) => !item.deleted));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  return calendars;
}

async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string
) {
  const syncWindow = getCalendarSyncWindow();
  const snapshots: CalendarEventSnapshot[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`
    );
    url.searchParams.set("timeMin", syncWindow.startsAt.toISOString());
    url.searchParams.set("timeMax", syncWindow.endsAt.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "250");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const page = await fetchGoogleJson<{
      items?: GoogleEvent[];
      nextPageToken?: string;
    }>(url.toString(), accessToken);

    for (const event of page.items ?? []) {
      const snapshot = mapGoogleEvent(event);

      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  return snapshots;
}

async function syncGoogleSource(db: Db, source: CalendarSourceRecord) {
  let credentials =
    decryptCalendarCredentials<GoogleCalendarCredentials>(
      source.encryptedCredentials
    );
  credentials = await refreshGoogleCredentials(db, source, credentials);

  const remoteCalendars = await fetchGoogleCalendars(credentials.accessToken);
  const snapshots = remoteCalendars.map((calendar) => ({
    externalCalendarId: calendar.id,
    name: calendar.summary?.trim() || "Google calendar",
    color: normalizeCalendarColor(calendar.backgroundColor, calendar.id),
    isPrimary: calendar.primary ?? false
  }));
  const localCalendars = await upsertConnectedCalendars(db, source, snapshots);

  for (const calendar of localCalendars.filter((item) => item.isEnabled)) {
    const events = await fetchGoogleCalendarEvents(
      credentials.accessToken,
      calendar.externalCalendarId
    );
    await replaceCalendarEvents(db, source, calendar, events);
  }
}

async function refreshMicrosoftCredentials(
  db: Db,
  source: CalendarSourceRecord,
  credentials: MicrosoftGraphCalendarCredentials
) {
  const refreshed = await refreshMicrosoftCalendarCredentials(credentials);

  if (refreshed === credentials) {
    return credentials;
  }

  const encrypted = encryptCalendarCredentials(refreshed);

  await db
    .update(calendarSources)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(calendarSources.id, source.id));

  return refreshed;
}

function microsoftEventUrl(event: MicrosoftEvent) {
  return event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? event.webLink;
}

export function mapMicrosoftEvent(
  event: MicrosoftEvent
): CalendarEventSnapshot | null {
  const startsAt = parseMicrosoftDateTime(event.start);
  const endsAt = parseMicrosoftDateTime(event.end);

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return null;
  }

  const organizer = event.organizer?.emailAddress;

  return {
    externalEventId: event.id,
    title: event.subject?.trim() || "Без названия",
    startsAt,
    endsAt,
    isAllDay: event.isAllDay ?? false,
    location: event.location?.displayName,
    organizer: organizer?.name ?? organizer?.address,
    attendeesSummary: event.attendees?.length
      ? `${event.attendees.length} участников`
      : undefined,
    eventUrl: microsoftEventUrl(event),
    providerUpdatedAt: event.lastModifiedDateTime
      ? new Date(event.lastModifiedDateTime)
      : undefined
  };
}

function extractLocationUrl(location: string | undefined) {
  return location?.match(/https?:\/\/\S+/i)?.[0];
}

function mapEwsCalendarItem(item: EwsCalendarItem): CalendarEventSnapshot | null {
  const startsAt = item.start ? new Date(item.start) : null;
  const endsAt = item.end ? new Date(item.end) : null;

  if (
    !startsAt ||
    !endsAt ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return null;
  }

  const attendeeCount = item.displayTo
    ? item.displayTo.split(";").filter((name) => name.trim()).length
    : 0;

  return {
    externalEventId: item.id,
    title: item.subject || "Без названия",
    startsAt,
    endsAt,
    isAllDay: item.isAllDay ?? false,
    location: item.location,
    organizer: item.organizerName,
    attendeesSummary: attendeeCount ? `${attendeeCount} участников` : undefined,
    eventUrl: extractLocationUrl(item.location),
    providerUpdatedAt: item.lastModified ? new Date(item.lastModified) : undefined
  };
}

async function syncExchangeSource(db: Db, source: CalendarSourceRecord) {
  const credentials =
    decryptCalendarCredentials<ExchangeCalendarCredentials>(
      source.encryptedCredentials
    );
  const remoteFolders = await fetchEwsCalendarFolders(credentials);
  const defaultFolderId = await fetchEwsDefaultCalendarFolderId(credentials);
  const snapshots = remoteFolders.map((folder) => ({
    externalCalendarId: folder.id,
    name: calendarDisplayName(folder.displayName, "Exchange calendar"),
    color: colorFromString(folder.id),
    isPrimary: folder.id === defaultFolderId
  }));
  const localCalendars = await upsertConnectedCalendars(db, source, snapshots);

  for (const calendar of localCalendars.filter((item) => item.isEnabled)) {
    const items = await fetchEwsCalendarItems(
      credentials,
      calendar.externalCalendarId,
      getCalendarSyncWindow()
    );
    const events = items
      .map(mapEwsCalendarItem)
      .filter((event): event is CalendarEventSnapshot => event !== null);
    await replaceCalendarEvents(db, source, calendar, events);
  }
}

async function syncMicrosoftSource(db: Db, source: CalendarSourceRecord) {
  let credentials =
    decryptCalendarCredentials<MicrosoftGraphCalendarCredentials>(
      source.encryptedCredentials
    );
  credentials = await refreshMicrosoftCredentials(db, source, credentials);

  const remoteCalendars = await fetchMicrosoftCalendars(credentials.accessToken);
  const snapshots = remoteCalendars.map((calendar) => ({
    externalCalendarId: calendar.id,
    name: calendarDisplayName(calendar.name, "Microsoft calendar"),
    color: colorFromString(calendar.id),
    isPrimary: calendar.isDefaultCalendar ?? false
  }));
  const localCalendars = await upsertConnectedCalendars(db, source, snapshots);

  for (const calendar of localCalendars.filter((item) => item.isEnabled)) {
    const items = await fetchMicrosoftCalendarEvents(
      credentials.accessToken,
      calendar.externalCalendarId
    );
    const events = items
      .map(mapMicrosoftEvent)
      .filter((event): event is CalendarEventSnapshot => event !== null);
    await replaceCalendarEvents(db, source, calendar, events);
  }
}

async function createYandexClient(credentials: YandexCalendarCredentials) {
  return createDAVClient({
    serverUrl: credentials.serverUrl,
    credentials: {
      username: credentials.username,
      password: credentials.password
    },
    authMethod: "Basic",
    defaultAccountType: "caldav"
  });
}

function normalizeYandexCalendar(calendar: DAVCalendar): ConnectedCalendarSnapshot {
  return {
    externalCalendarId: calendar.url,
    name: calendarDisplayName(calendar.displayName, "Yandex calendar"),
    color: normalizeCalendarColor(calendar.calendarColor, calendar.url),
    isPrimary: false
  };
}

function icalTimeToDate(value: ICAL.Time) {
  return value.toJSDate();
}

function getIcalDateValue(component: ICAL.Component, name: string) {
  const value = component.getFirstPropertyValue(name);
  return value instanceof ICAL.Time ? value.toJSDate() : undefined;
}

function getIcalTextValue(component: ICAL.Component, name: string) {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value : undefined;
}

function parseCalDavEvent(
  object: DAVObject,
  component: ICAL.Component
): CalendarEventSnapshot | null {
  const event = new ICAL.Event(component);
  const startsAt = icalTimeToDate(event.startDate);
  const endsAt = icalTimeToDate(event.endDate);

  if (endsAt <= startsAt) {
    return null;
  }

  return {
    externalEventId: `${event.uid || object.url}:${event.startDate.toICALString()}`,
    title: event.summary?.trim() || "Без названия",
    startsAt,
    endsAt,
    isAllDay: event.startDate.isDate,
    location: event.location || undefined,
    organizer: getIcalTextValue(component, "organizer"),
    attendeesSummary: event.attendees.length
      ? `${event.attendees.length} участников`
      : undefined,
    providerUpdatedAt:
      getIcalDateValue(component, "last-modified") ??
      getIcalDateValue(component, "dtstamp")
  };
}

function parseCalDavEvents(object: DAVObject) {
  if (typeof object.data !== "string") {
    return [];
  }

  try {
    const parsed = ICAL.parse(object.data);
    const calendar = new ICAL.Component(parsed);
    return calendar
      .getAllSubcomponents("vevent")
      .map((component) => parseCalDavEvent(object, component))
      .filter((event): event is CalendarEventSnapshot => event !== null);
  } catch {
    return [];
  }
}

async function fetchYandexCalendarEvents(client: DavClient, calendar: DAVCalendar) {
  const syncWindow = getCalendarSyncWindow();
  const objects = await client.fetchCalendarObjects({
    calendar,
    timeRange: {
      start: syncWindow.startsAt.toISOString(),
      end: syncWindow.endsAt.toISOString()
    },
    expand: true
  });

  return objects.flatMap(parseCalDavEvents).filter((event) => {
    return event.startsAt >= syncWindow.startsAt && event.startsAt <= syncWindow.endsAt;
  });
}

async function syncYandexSource(db: Db, source: CalendarSourceRecord) {
  const credentials =
    decryptCalendarCredentials<YandexCalendarCredentials>(
      source.encryptedCredentials
    );
  const client = await createYandexClient(credentials);
  const remoteCalendars = await client.fetchCalendars();
  const snapshots = remoteCalendars.map(normalizeYandexCalendar);
  const localCalendars = await upsertConnectedCalendars(db, source, snapshots);
  const remoteById = new Map(
    remoteCalendars.map((calendar) => [calendar.url, calendar])
  );

  for (const calendar of localCalendars.filter((item) => item.isEnabled)) {
    const remoteCalendar = remoteById.get(calendar.externalCalendarId);

    if (!remoteCalendar) {
      continue;
    }

    const events = await fetchYandexCalendarEvents(client, remoteCalendar);
    await replaceCalendarEvents(db, source, calendar, events);
  }
}

export async function syncCalendarSource(sourceId: string) {
  await withDb(async (db) => {
    const source = await db.query.calendarSources.findFirst({
      where: eq(calendarSources.id, sourceId)
    });

    if (!source || source.status !== "active") {
      return;
    }

    switch (source.provider) {
      case "exchange_ews":
        await syncExchangeSource(db, source);
        break;
      case "microsoft_graph":
        await syncMicrosoftSource(db, source);
        break;
      case "google_calendar":
        await syncGoogleSource(db, source);
        break;
      case "yandex_caldav":
        await syncYandexSource(db, source);
        break;
      case "browser_session":
        return;
      default:
        return;
    }

    await db
      .update(calendarSources)
      .set({
        syncState: {
          lastSyncedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      })
      .where(eq(calendarSources.id, source.id));
  });
}

export async function syncEnabledCalendarsForUser(userId: string) {
  const sources = await withDb((db) =>
    db
      .select({ id: calendarSources.id })
      .from(calendarSources)
      .where(
        and(
          eq(calendarSources.userId, userId),
          eq(calendarSources.status, "active")
        )
      )
  );

  for (const source of sources) {
    await syncCalendarSource(source.id);
  }
}

export async function syncAllActiveCalendarSources() {
  const sources = await withDb((db) =>
    db
      .select({ id: calendarSources.id })
      .from(calendarSources)
      .where(eq(calendarSources.status, "active"))
  );

  for (const source of sources) {
    await syncCalendarSource(source.id);
  }
}

export async function createYandexCalendarSource(params: {
  password: string;
  serverUrl: string;
  userId: string;
  username: string;
}) {
  const serverUrl = params.serverUrl.replace(/\/+$/, "");
  const credentials: YandexCalendarCredentials = {
    password: params.password,
    serverUrl,
    username: params.username
  };
  const client = await createYandexClient(credentials);
  await client.fetchCalendars();
  const encrypted = encryptCalendarCredentials(credentials);

  const [source] = await withDb((db) =>
    db
      .insert(calendarSources)
      .values({
        userId: params.userId,
        provider: "yandex_caldav",
        displayName: "Яндекс.Календарь",
        accountEmail: params.username,
        readOnly: true,
        ...encrypted
      })
      .returning({ id: calendarSources.id })
  );

  await syncCalendarSource(source.id);

  return source.id;
}

export async function createExchangeCalendarSource(params: {
  password: string;
  serverUrl: string;
  userId: string;
  username: string;
}) {
  const credentials: ExchangeCalendarCredentials = {
    password: params.password,
    serverUrl: normalizeEwsServerUrl(params.serverUrl),
    username: params.username
  };

  // Validate the login before storing anything.
  await fetchEwsCalendarFolders(credentials);

  const encrypted = encryptCalendarCredentials(credentials);
  const [source] = await withDb((db) =>
    db
      .insert(calendarSources)
      .values({
        userId: params.userId,
        provider: "exchange_ews",
        displayName: "Exchange",
        accountEmail: params.username,
        readOnly: true,
        ...encrypted
      })
      .returning({ id: calendarSources.id })
  );

  await syncCalendarSource(source.id);

  return source.id;
}

export async function createMicrosoftCalendarSource(params: {
  accountEmail: string;
  credentials: MicrosoftGraphCalendarCredentials;
  displayName: string;
  userId: string;
}) {
  const encrypted = encryptCalendarCredentials(params.credentials);
  const [source] = await withDb((db) =>
    db
      .insert(calendarSources)
      .values({
        userId: params.userId,
        provider: "microsoft_graph",
        displayName: params.displayName,
        accountEmail: params.accountEmail,
        readOnly: true,
        ...encrypted
      })
      .returning({ id: calendarSources.id })
  );

  await syncCalendarSource(source.id);

  return source.id;
}

export async function createGoogleCalendarSource(params: {
  accountEmail: string;
  credentials: GoogleCalendarCredentials;
  displayName: string;
  userId: string;
}) {
  const encrypted = encryptCalendarCredentials(params.credentials);
  const [source] = await withDb((db) =>
    db
      .insert(calendarSources)
      .values({
        userId: params.userId,
        provider: "google_calendar",
        displayName: params.displayName,
        accountEmail: params.accountEmail,
        readOnly: true,
        ...encrypted
      })
      .returning({ id: calendarSources.id })
  );

  await syncCalendarSource(source.id);

  return source.id;
}

export function getGoogleCalendarConfigured() {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

async function importCalendarEventsFromBridge(params: {
  accountEmail: string;
  calendarExternalId: string;
  calendarName: string;
  events: CalendarEventSnapshot[];
  provider: "browser_session" | "local_bridge";
  sourceDisplayName?: string;
  sourceFallbackName: string;
  userEmail: string;
}) {
  await withDb(async (db) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, params.userEmail)
    });

    if (!user) {
      throw new Error(`User not found: ${params.userEmail}`);
    }

    let source = await db.query.calendarSources.findFirst({
      where: and(
        eq(calendarSources.userId, user.id),
        eq(calendarSources.provider, params.provider),
        eq(calendarSources.accountEmail, params.accountEmail),
        eq(calendarSources.status, "active")
      )
    });

    if (!source) {
      const [created] = await db
        .insert(calendarSources)
        .values({
          userId: user.id,
          provider: params.provider,
          displayName: params.sourceDisplayName ?? params.sourceFallbackName,
          accountEmail: params.accountEmail,
          readOnly: true
        })
        .returning();
      source = created;
    }

    const calendars = await upsertConnectedCalendars(db, source, [
      {
        externalCalendarId: params.calendarExternalId,
        name: params.calendarName,
        color: colorFromString(params.calendarExternalId),
        isPrimary: true
      }
    ]);
    const calendar = calendars.find(
      (item) => item.externalCalendarId === params.calendarExternalId
    );

    if (!calendar) {
      throw new Error("Failed to create browser session calendar");
    }

    await replaceCalendarEvents(db, source, calendar, params.events);
    await db
      .update(calendarSources)
      .set({
        syncState: {
          lastSyncedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      })
      .where(eq(calendarSources.id, source.id));
  });
}

export async function importBrowserSessionCalendarEvents(params: {
  accountEmail: string;
  calendarExternalId: string;
  calendarName: string;
  events: CalendarEventSnapshot[];
  sourceDisplayName?: string;
  userEmail: string;
}) {
  await importCalendarEventsFromBridge({
    ...params,
    provider: "browser_session",
    sourceFallbackName: "Outlook Web"
  });
}

export async function importLocalBridgeCalendarEvents(params: {
  accountEmail: string;
  calendarExternalId: string;
  calendarName: string;
  events: CalendarEventSnapshot[];
  sourceDisplayName?: string;
  userEmail: string;
}) {
  await importCalendarEventsFromBridge({
    ...params,
    provider: "local_bridge",
    sourceFallbackName: "macOS Calendar"
  });
}
