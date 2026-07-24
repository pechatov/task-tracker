import { describe, expect, it } from "vitest";
import { mapGoogleEvent } from "../src/lib/calendar/sync";
import {
  formatCalendarEventTitle,
  normalizeCalendarEventStatus
} from "../src/lib/calendar/types";

describe("calendar event status", () => {
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
});
