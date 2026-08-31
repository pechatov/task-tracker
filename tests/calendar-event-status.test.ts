import { describe, expect, it } from "vitest";
import {
  applyCalendarEventCancellation,
  dropCancelledCalendarEventSnapshots,
  mapGoogleEvent,
  mapGoogleEventCancellation
} from "../src/lib/calendar/sync";
import {
  formatCalendarEventTitle,
  hasCancelledTitlePrefix,
  normalizeCalendarEventStatus
} from "../src/lib/calendar/types";

describe("calendar event status", () => {
  it("drops cancelled snapshots so they are removed from the tracker", () => {
    const base = {
      title: "ml section sync",
      startsAt: new Date("2026-08-31T09:00:00Z"),
      endsAt: new Date("2026-08-31T10:00:00Z"),
      isAllDay: false
    };
    const kept = dropCancelledCalendarEventSnapshots([
      { ...base, externalEventId: "event-1", status: "confirmed" },
      { ...base, externalEventId: "event-2", status: "cancelled" },
      {
        ...base,
        externalEventId: "event-3",
        title: "Отменено: AI Center Technical Townhall",
        status: "confirmed"
      }
    ]);

    expect(kept.map((snapshot) => snapshot.externalEventId)).toEqual([
      "event-1"
    ]);
  });

  it("detects Outlook cancellation title prefixes", () => {
    expect(hasCancelledTitlePrefix("Отменено: AI Center Technical Townhall")).toBe(true);
    expect(hasCancelledTitlePrefix("Canceled: weekly sync")).toBe(true);
    expect(hasCancelledTitlePrefix("Cancelled: weekly sync")).toBe(true);
    expect(hasCancelledTitlePrefix("ml section sync")).toBe(false);
  });

  it("normalizes both cancellation spellings", () => {
    expect(normalizeCalendarEventStatus("cancelled")).toBe("cancelled");
    expect(normalizeCalendarEventStatus("canceled")).toBe("cancelled");
    expect(normalizeCalendarEventStatus("confirmed")).toBe("confirmed");
  });

  it("adds the requested marker only to cancelled event titles", () => {
    expect(formatCalendarEventTitle("ml section sync", "cancelled")).toBe(
      "ml section sync (canceled)"
    );
    expect(formatCalendarEventTitle("ml section sync", "confirmed")).toBe(
      "ml section sync"
    );
  });

  it("keeps cancelled Google events when their time range is available", () => {
    expect(
      mapGoogleEvent({
        id: "event-1",
        status: "cancelled",
        summary: "ml section sync",
        start: { dateTime: "2026-07-24T12:00:00Z" },
        end: { dateTime: "2026-07-24T12:30:00Z" }
      })
    ).toMatchObject({
      externalEventId: "event-1",
      status: "cancelled",
      title: "ml section sync"
    });
  });

  it("hydrates a date-less Google cancellation from the stored event", () => {
    const cancellation = mapGoogleEventCancellation({
      id: "event-1",
      status: "cancelled",
      updated: "2026-07-24T11:55:00Z"
    });

    expect(cancellation).not.toBeNull();

    const cancelled = applyCalendarEventCancellation(
      {
        externalEventId: "event-1",
        title: "ml section sync",
        startsAt: new Date("2026-07-24T12:00:00Z"),
        endsAt: new Date("2026-07-24T12:30:00Z"),
        isAllDay: false,
        eventUrl: "https://meet.example.com/ml-sync",
        status: "confirmed",
        providerUpdatedAt: new Date("2026-07-23T10:00:00Z")
      },
      cancellation!
    );

    expect(cancelled).toMatchObject({
      externalEventId: "event-1",
      title: "ml section sync",
      eventUrl: "https://meet.example.com/ml-sync",
      status: "cancelled"
    });
    expect(cancelled.startsAt.toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(cancelled.endsAt.toISOString()).toBe("2026-07-24T12:30:00.000Z");
    expect(cancelled.providerUpdatedAt?.toISOString()).toBe(
      "2026-07-24T11:55:00.000Z"
    );
  });
});
