import { describe, expect, it } from "vitest";
import {
  getCalendarSyncWindow,
  isWithinCalendarSyncWindow
} from "../src/lib/calendar/sync-window";

describe("calendar sync window", () => {
  it("uses 60 days back and 60 days forward by default", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const syncWindow = getCalendarSyncWindow(now);

    expect(syncWindow.startsAt.toISOString()).toBe("2026-04-30T00:00:00.000Z");
    expect(syncWindow.endsAt.toISOString()).toBe("2026-08-28T23:59:59.999Z");
  });

  it("checks whether a date is inside the sync window", () => {
    const syncWindow = getCalendarSyncWindow(
      new Date("2026-06-29T12:00:00.000Z")
    );

    expect(
      isWithinCalendarSyncWindow(
        new Date("2026-06-29T15:00:00.000Z"),
        syncWindow
      )
    ).toBe(true);
    expect(
      isWithinCalendarSyncWindow(
        new Date("2026-08-29T00:00:00.000Z"),
        syncWindow
      )
    ).toBe(false);
  });
});
