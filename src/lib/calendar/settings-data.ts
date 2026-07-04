import { asc, desc, eq } from "drizzle-orm";
import { withDb } from "@/db/with-db";
import { calendarSources, connectedCalendars } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";
import {
  getCalendarProviderLabel,
  getGoogleCalendarConfigured
} from "@/lib/calendar/sync";

export type CalendarSettingsSource = {
  id: string;
  accountEmail: string | null;
  calendars: CalendarSettingsCalendar[];
  displayName: string;
  lastSyncedAt: string | null;
  providerLabel: string;
  status: "active" | "disconnected";
};

export type CalendarSettingsCalendar = {
  id: string;
  color: string;
  isEnabled: boolean;
  isPrimary: boolean;
  name: string;
};

export type CalendarSettingsData = {
  isGoogleConfigured: boolean;
  sources: CalendarSettingsSource[];
};

function getLastSyncedAt(syncState: Record<string, unknown> | null) {
  return typeof syncState?.lastSyncedAt === "string"
    ? syncState.lastSyncedAt
    : null;
}

export async function getCalendarSettingsData(): Promise<CalendarSettingsData> {
  return withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const sourceRows = await db
      .select({
        id: calendarSources.id,
        provider: calendarSources.provider,
        displayName: calendarSources.displayName,
        accountEmail: calendarSources.accountEmail,
        status: calendarSources.status,
        syncState: calendarSources.syncState
      })
      .from(calendarSources)
      .where(eq(calendarSources.userId, userId))
      .orderBy(desc(calendarSources.updatedAt));
    const calendarRows = await db
      .select({
        id: connectedCalendars.id,
        sourceId: connectedCalendars.sourceId,
        name: connectedCalendars.name,
        color: connectedCalendars.color,
        isEnabled: connectedCalendars.isEnabled,
        isPrimary: connectedCalendars.isPrimary
      })
      .from(connectedCalendars)
      .where(eq(connectedCalendars.userId, userId))
      .orderBy(asc(connectedCalendars.name));

    return {
      isGoogleConfigured: getGoogleCalendarConfigured(),
      sources: sourceRows.map((source) => ({
        id: source.id,
        accountEmail: source.accountEmail,
        calendars: calendarRows
          .filter((calendar) => calendar.sourceId === source.id)
          .map((calendar) => ({
            id: calendar.id,
            color: calendar.color,
            isEnabled: calendar.isEnabled,
            isPrimary: calendar.isPrimary,
            name: calendar.name
          })),
        displayName: source.displayName,
        lastSyncedAt: getLastSyncedAt(source.syncState),
        providerLabel: getCalendarProviderLabel(source.provider),
        status: source.status
      }))
    };
  });
}
