import type { MicrosoftGraphCalendarCredentials } from "./credentials";
import { getCalendarSyncWindow } from "./sync-window";
import { getEnv } from "../env";

type MicrosoftTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type MicrosoftProfile = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

export type MicrosoftCalendar = {
  id: string;
  name?: string;
  isDefaultCalendar?: boolean;
};

type MicrosoftDateTime = {
  dateTime?: string;
  timeZone?: string;
};

export type MicrosoftEvent = {
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
      name?: string;
      address?: string;
    };
  };
  attendees?: unknown[];
  webLink?: string;
  onlineMeeting?: {
    joinUrl?: string;
  };
  onlineMeetingUrl?: string;
  lastModifiedDateTime?: string;
};

const graphBaseUrl = "https://graph.microsoft.com/v1.0";

const microsoftScopes = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Calendars.Read"
];

function getMicrosoftTenantId() {
  return getEnv().MICROSOFT_TENANT_ID.trim() || "common";
}

function getMicrosoftOAuthBaseUrl() {
  return `https://login.microsoftonline.com/${encodeURIComponent(
    getMicrosoftTenantId()
  )}/oauth2/v2.0`;
}

function microsoftCredentialsFromToken(
  token: MicrosoftTokenResponse,
  fallbackRefreshToken?: string
): MicrosoftGraphCalendarCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? fallbackRefreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    scope: token.scope,
    tokenType: token.token_type
  };
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
  const response = await fetch(`${getMicrosoftOAuthBaseUrl()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Microsoft token request failed: ${response.status}`);
  }

  return (await response.json()) as MicrosoftTokenResponse;
}

export function getMicrosoftCalendarConfigured() {
  const env = getEnv();
  return Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
}

export function getMicrosoftRedirectUri() {
  return new URL("/api/calendar/microsoft/callback", getEnv().APP_BASE_URL)
    .toString();
}

export function getMicrosoftAuthorizationUrl(state: string) {
  const env = getEnv();

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft calendar OAuth is not configured");
  }

  const url = new URL(`${getMicrosoftOAuthBaseUrl()}/authorize`);
  url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", microsoftScopes.join(" "));
  url.searchParams.set("state", state);

  return url;
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

export async function refreshMicrosoftCalendarCredentials(
  credentials: MicrosoftGraphCalendarCredentials
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
    scope: microsoftScopes.join(" ")
  });

  return microsoftCredentialsFromToken(token, credentials.refreshToken);
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
  credentials: MicrosoftGraphCalendarCredentials
) {
  const url = new URL(`${graphBaseUrl}/me`);
  url.searchParams.set("$select", "displayName,mail,userPrincipalName");

  return fetchMicrosoftJson<MicrosoftProfile>(url.toString(), credentials.accessToken);
}

export async function fetchMicrosoftCalendars(accessToken: string) {
  const calendars: MicrosoftCalendar[] = [];
  let nextUrl = `${graphBaseUrl}/me/calendars?$select=id,name,isDefaultCalendar`;

  do {
    const page = await fetchMicrosoftJson<{
      value?: MicrosoftCalendar[];
      "@odata.nextLink"?: string;
    }>(nextUrl, accessToken);

    calendars.push(...(page.value ?? []));
    nextUrl = page["@odata.nextLink"] ?? "";
  } while (nextUrl);

  return calendars;
}

export function parseMicrosoftDateTime(value: MicrosoftDateTime | undefined) {
  if (!value?.dateTime) {
    return null;
  }

  const hasOffset = /(?:z|[+-]\d{2}:\d{2})$/i.test(value.dateTime);
  const isoDateTime =
    hasOffset || value.timeZone?.toUpperCase() !== "UTC"
      ? value.dateTime
      : `${value.dateTime}Z`;
  const date = new Date(isoDateTime);

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  calendarId: string
) {
  const syncWindow = getCalendarSyncWindow();
  const events: MicrosoftEvent[] = [];
  const url = new URL(
    `${graphBaseUrl}/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
  );
  url.searchParams.set("startDateTime", syncWindow.startsAt.toISOString());
  url.searchParams.set("endDateTime", syncWindow.endsAt.toISOString());
  url.searchParams.set("$top", "250");
  url.searchParams.set(
    "$select",
    [
      "id",
      "subject",
      "start",
      "end",
      "isAllDay",
      "location",
      "organizer",
      "attendees",
      "webLink",
      "onlineMeeting",
      "onlineMeetingUrl",
      "lastModifiedDateTime"
    ].join(",")
  );

  let nextUrl = url.toString();

  do {
    const page = await fetchMicrosoftJson<{
      value?: MicrosoftEvent[];
      "@odata.nextLink"?: string;
    }>(nextUrl, accessToken);

    events.push(...(page.value ?? []));
    nextUrl = page["@odata.nextLink"] ?? "";
  } while (nextUrl);

  return events;
}
