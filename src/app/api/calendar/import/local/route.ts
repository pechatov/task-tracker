import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importLocalBridgeCalendarEvents } from "@/lib/calendar/sync";
import type { CalendarEventSnapshot } from "@/lib/calendar/types";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  externalEventId: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  isAllDay: z.boolean().default(false),
  location: z.string().optional(),
  organizer: z.string().optional(),
  attendeesSummary: z.string().optional(),
  eventUrl: z.string().url().optional(),
  providerUpdatedAt: z.string().datetime({ offset: true }).optional()
});

const importSchema = z.object({
  accountEmail: z.string().min(1),
  calendarExternalId: z.string().min(1),
  calendarName: z.string().min(1),
  events: z.array(eventSchema),
  sourceDisplayName: z.string().optional(),
  userEmail: z.string().email().optional()
});

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

function parseEvent(
  event: z.infer<typeof eventSchema>
): CalendarEventSnapshot | null {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const providerUpdatedAt = event.providerUpdatedAt
    ? new Date(event.providerUpdatedAt)
    : undefined;

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt ||
    (providerUpdatedAt && Number.isNaN(providerUpdatedAt.getTime()))
  ) {
    return null;
  }

  return {
    externalEventId: event.externalEventId,
    title: event.title,
    startsAt,
    endsAt,
    isAllDay: event.isAllDay,
    location: event.location,
    organizer: event.organizer,
    attendeesSummary: event.attendeesSummary,
    eventUrl: event.eventUrl,
    providerUpdatedAt
  };
}

export async function POST(request: NextRequest) {
  const env = getEnv();

  if (!env.LOCAL_CALENDAR_IMPORT_TOKEN) {
    return NextResponse.json(
      { error: "Local calendar import is not configured" },
      { status: 503 }
    );
  }

  if (getBearerToken(request) !== env.LOCAL_CALENDAR_IMPORT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const userEmail = parsed.data.userEmail ?? env.LOCAL_CALENDAR_IMPORT_USER_EMAIL;

  if (!userEmail) {
    return NextResponse.json(
      { error: "userEmail is required" },
      { status: 400 }
    );
  }

  const events = parsed.data.events
    .map(parseEvent)
    .filter((event): event is CalendarEventSnapshot => event !== null);

  await importLocalBridgeCalendarEvents({
    accountEmail: parsed.data.accountEmail,
    calendarExternalId: parsed.data.calendarExternalId,
    calendarName: parsed.data.calendarName,
    events,
    sourceDisplayName: parsed.data.sourceDisplayName,
    userEmail
  });

  return NextResponse.json({
    importedEvents: events.length,
    receivedEvents: parsed.data.events.length
  });
}
