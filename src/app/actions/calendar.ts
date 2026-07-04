"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withDb } from "@/db/with-db";
import {
  calendarEvents,
  calendarSources,
  connectedCalendars
} from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";
import {
  createExchangeCalendarSource,
  createYandexCalendarSource,
  syncCalendarSource
} from "@/lib/calendar/sync";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateCalendarViews() {
  revalidatePath("/settings");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function connectYandexCalendar(formData: FormData) {
  const serverUrl = getString(formData, "serverUrl") || "https://caldav.yandex.ru";
  const username = getString(formData, "username");
  const password = getString(formData, "password");

  if (!username || !password) {
    throw new Error("Yandex CalDAV username and password are required");
  }

  const userId = await withDb((db) => requireCurrentUserId(db));

  await createYandexCalendarSource({
    password,
    serverUrl,
    userId,
    username
  });

  revalidateCalendarViews();
}

export async function connectExchangeCalendar(formData: FormData) {
  const serverUrl = getString(formData, "serverUrl");
  const username = getString(formData, "username");
  const password = getString(formData, "password");

  if (!serverUrl || !username || !password) {
    throw new Error("Exchange server URL, username and password are required");
  }

  const userId = await withDb((db) => requireCurrentUserId(db));

  await createExchangeCalendarSource({
    password,
    serverUrl,
    userId,
    username
  });

  revalidateCalendarViews();
}

export async function syncCalendarSourceAction(formData: FormData) {
  const sourceId = getString(formData, "sourceId");

  if (!sourceId) {
    throw new Error("Calendar source id is required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const source = await db.query.calendarSources.findFirst({
      where: and(eq(calendarSources.id, sourceId), eq(calendarSources.userId, userId))
    });

    if (!source || source.status !== "active") {
      throw new Error("Calendar source not found");
    }
  });

  await syncCalendarSource(sourceId);
  revalidateCalendarViews();
}

export async function disconnectCalendarSource(formData: FormData) {
  const sourceId = getString(formData, "sourceId");

  if (!sourceId) {
    throw new Error("Calendar source id is required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);

    await db
      .update(calendarSources)
      .set({
        status: "disconnected",
        disconnectedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(calendarSources.id, sourceId), eq(calendarSources.userId, userId)));
    await db
      .update(connectedCalendars)
      .set({ isEnabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(connectedCalendars.sourceId, sourceId),
          eq(connectedCalendars.userId, userId)
        )
      );
    await db
      .delete(calendarEvents)
      .where(
        and(eq(calendarEvents.sourceId, sourceId), eq(calendarEvents.userId, userId))
      );
  });

  revalidateCalendarViews();
}

export async function toggleConnectedCalendar(formData: FormData) {
  const calendarId = getString(formData, "calendarId");
  const isEnabled = getString(formData, "isEnabled") === "on";

  if (!calendarId) {
    throw new Error("Connected calendar id is required");
  }

  const sourceId = await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const calendar = await db.query.connectedCalendars.findFirst({
      where: and(
        eq(connectedCalendars.id, calendarId),
        eq(connectedCalendars.userId, userId)
      )
    });

    if (!calendar) {
      throw new Error("Connected calendar not found");
    }

    await db
      .update(connectedCalendars)
      .set({ isEnabled, updatedAt: new Date() })
      .where(
        and(
          eq(connectedCalendars.id, calendarId),
          eq(connectedCalendars.userId, userId)
        )
      );

    return calendar.sourceId;
  });

  if (isEnabled) {
    await syncCalendarSource(sourceId);
  }

  revalidateCalendarViews();
}
