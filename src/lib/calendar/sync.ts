import { createHash } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import ICAL from "ical.js";
import {
  createDAVClient,
  type DAVCalendar,
  type DAVObject
} from "tsdav";
import { withDb } from "@/db/with-db";
import {
  calendarEvents,
  calendarSources,
  connectedCalendars
} from "@/db/schema";
import {
  decryptCalendarCredentials,
  encryptCalendarCredentials,
  type MicrosoftCalendarCredentials,
  type YandexCalendarCredentials
} from "@/lib/calendar/credentials";
import { getCalendarSyncWindow } from "@/lib/calendar/sync-window";
import type {
  CalendarEventSnapshot,
  CalendarProvider,
  ConnectedCalendarSnapshot
} from "@/lib/calendar/types";
import { getEnv } from "@/lib/env";

type Db = Parameters<Parameters<typeof withDb>[0]>[0];

type CalendarSourceRecord = typeof calendarSources.$inferSelect;

type ConnectedCalendarRecord = typeof connectedCalendars.$inferSelect;

type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

type MicrosoftTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type MicrosoftProfile = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

type MicrosoftCalendar = {
  id: string;
  name?: string;
  color?: string;
  hexColor?: string;
  isDefaultCalendar?: boolean;
};

type MicrosoftEvent = {
  id: string;
  subject?: string;
  start?: MicrosoftDateTime;
  end?: MicrosoftDateTime;
  isAllDay?: boolean;
  location?: {
    displayName?: string;
  };
  organizer?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  attendees?: unknown[];
  webLink?: string;
  onlineMeeting?: {
    joinUrl?: string;
  };
  lastModifiedDateTime?: string;
};

type MicrosoftDateTime = {
  dateTime?: string;
  timeZone?: string;
};

const microsoftScopes = ["offline_access", "User.Read", "Calendars.Read"];

const calendarColors = [
  "#2d7dd2",
  "#287d55",
  "#b44b45",
  "#7f56d9",
  "#c26a2c",
  "#008c95",
  "#a04f8b",
  "#5c6f2f"
];

const microsoftColorMap: Record<string, string> = {
  auto: "#2d7dd2",
  lightBlue: "#2d7dd2",
  lightGreen: "#287d55",
  lightOrange: "#c26a2c",
  lightGray: "#77736a",
  lightYellow: "#a37800",
  lightTeal: "#008c95",
  lightPink: "#a04f8b",
  lightBrown: "#8a5a2b",
  lightRed: "#b44b45",
  maxColor: "#2d7dd2"
};

export function getCalendarProviderLabel(provider: CalendarProvider) {
  return provider === "microsoft_graph" ? "Microsoft 365" : "Яндекс.Календарь";
}

export function getMicrosoftAuthorizationUrl(state: string) {
  const env = getEnv();

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft calendar OAuth is not configured");
  }

  const url = new URL(
    `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`
  );
  url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", microsoftScopes.join(" "));
  url.searchParams.set("state", state);

  return url;
}

export function getMicrosoftRedirectUri() {
  return new URL("/api/calendar/microsoft/callback", getEnv().APP_BASE_URL)
    .toString();
}

function getMicrosoftTokenUrl() {
  return `https://login.microsoftonline.com/${
    getEnv().MICROSOFT_TENANT_ID
  }/oauth2/v2.0/token`;
}

async function exchangeMicrosoftToken(params: Record<string, string>) {
  const env = getEnv();

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft calendar OAuth is not configured");
  }

  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    ...params
  });
  const response = await fetch(getMicrosoftTokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Microsoft token request failed: ${response.status}`);
  }

  return (await response.json()) as MicrosoftTokenResponse;
}

export async function exchangeMicrosoftAuthorizationCode(code: string) {
  const token = await exchangeMicrosoftToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: getMicrosoftRedirectUri(),
    scope: microsoftScopes.join(" ")
  });

  return microsoftCredentialsFromToken(token);
}

async function refreshMicrosoftCredentials(
  db: Db,
  source: CalendarSourceRecord,
  credentials: MicrosoftCalendarCredentials
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

  const token = await exchangeMicrosoftToken({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
    redirect_uri: getMicrosoftRedirectUri(),
    scope: microsoftScopes.join(" ")
  });
  const refreshed = microsoftCredentialsFromToken(token, credentials.refreshToken);
  const encrypted = encryptCalendarCredentials(refreshed);

  await db
    .update(calendarSources)
    .set({ ...encrypted, updatedAt: new Date() })
    .where(eq(calendarSources.id, source.id));

  return refreshed;
}

function microsoftCredentialsFromToken(
  token: MicrosoftTokenResponse,
  fallbackRefreshToken?: string
): MicrosoftCalendarCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? fallbackRefreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    scope: token.scope,
    tokenType: token.token_type
  };
}

async function fetchMicrosoftJson<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      prefer: 'outlook.timezone="UTC"'
    }
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchMicrosoftProfile(
  credentials: MicrosoftCalendarCredentials
) {
  return fetchMicrosoftJson<MicrosoftProfile>(
    "https://graph.microsoft.com/v1.0/me",
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

  if (value && microsoftColorMap[value]) {
    return microsoftColorMap[value];
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

function parseMicrosoftDateTime(value: MicrosoftDateTime | undefined) {
  const raw = value?.dateTime;

  if (!raw) {
    return null;
  }

  const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function mapMicrosoftEvent(event: MicrosoftEvent): CalendarEventSnapshot | null {
  const startsAt = parseMicrosoftDateTime(event.start);
  const endsAt = parseMicrosoftDateTime(event.end);

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return null;
  }

  return {
    externalEventId: event.id,
    title: event.subject?.trim() || "Без названия",
    startsAt,
    endsAt,
    isAllDay: event.isAllDay ?? false,
    location: event.location?.displayName,
    organizer:
      event.organizer?.emailAddress?.name ??
      event.organizer?.emailAddress?.address,
    attendeesSummary: event.attendees?.length
      ? `${event.attendees.length} участников`
      : undefined,
    eventUrl: event.onlineMeeting?.joinUrl ?? event.webLink,
    providerUpdatedAt: event.lastModifiedDateTime
      ? new Date(event.lastModifiedDateTime)
      : undefined
  };
}

async function fetchMicrosoftCalendars(accessToken: string) {
  const result = await fetchMicrosoftJson<{
    value?: MicrosoftCalendar[];
  }>(
    "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,color,hexColor,isDefaultCalendar",
    accessToken
  );

  return result.value ?? [];
}

async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  calendarId: string
) {
  const syncWindow = getCalendarSyncWindow();
  const snapshots: CalendarEventSnapshot[] = [];
  let url =
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(
      calendarId
    )}/calendarView` +
    `?startDateTime=${encodeURIComponent(syncWindow.startsAt.toISOString())}` +
    `&endDateTime=${encodeURIComponent(syncWindow.endsAt.toISOString())}` +
    "&$top=100";

  while (url) {
    const page = await fetchMicrosoftJson<{
      "@odata.nextLink"?: string;
      value?: MicrosoftEvent[];
    }>(url, accessToken);

    for (const event of page.value ?? []) {
      const snapshot = mapMicrosoftEvent(event);

      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    url = page["@odata.nextLink"] ?? "";
  }

  return snapshots;
}

async function syncMicrosoftSource(db: Db, source: CalendarSourceRecord) {
  let credentials =
    decryptCalendarCredentials<MicrosoftCalendarCredentials>(
      source.encryptedCredentials
    );
  credentials = await refreshMicrosoftCredentials(db, source, credentials);

  const remoteCalendars = await fetchMicrosoftCalendars(credentials.accessToken);
  const snapshots = remoteCalendars.map((calendar) => ({
    externalCalendarId: calendar.id,
    name: calendar.name?.trim() || "Microsoft calendar",
    color: normalizeCalendarColor(calendar.hexColor ?? calendar.color, calendar.id),
    isPrimary: calendar.isDefaultCalendar ?? false
  }));
  const localCalendars = await upsertConnectedCalendars(db, source, snapshots);

  for (const calendar of localCalendars.filter((item) => item.isEnabled)) {
    const events = await fetchMicrosoftCalendarEvents(
      credentials.accessToken,
      calendar.externalCalendarId
    );
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

    if (source.provider === "microsoft_graph") {
      await syncMicrosoftSource(db, source);
    } else {
      await syncYandexSource(db, source);
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

export async function createMicrosoftCalendarSource(params: {
  accountEmail: string;
  credentials: MicrosoftCalendarCredentials;
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

export function getMicrosoftCalendarConfigured() {
  const env = getEnv();
  return Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
}
