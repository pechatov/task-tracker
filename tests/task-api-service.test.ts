import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  ApiServiceError,
  createTimeBlockFromDateAndTimes,
  getCalendarEventOverlapCondition,
  MAX_CALENDAR_ITEMS,
  MAX_CALENDAR_RANGE_DAYS,
  normalizeCalendarRange
} from "../src/lib/api/task-service";

describe("task API service helpers", () => {
  it("builds calendar-slot task time blocks from app-local wall-clock time", () => {
    const timeBlock = createTimeBlockFromDateAndTimes({
      dueDate: "2026-07-10",
      startTime: "14:00",
      endTime: "15:30"
    });

    expect(timeBlock).toEqual({
      startsAt: "2026-07-10T11:00:00.000Z",
      endsAt: "2026-07-10T12:30:00.000Z"
    });
  });

  it("rejects invalid date or time values", () => {
    expect(() =>
      createTimeBlockFromDateAndTimes({
        dueDate: "2026-13-10",
        startTime: "14:00",
        endTime: "15:30"
      })
    ).toThrow(ApiServiceError);

    expect(() =>
      createTimeBlockFromDateAndTimes({
        dueDate: "2026-07-10",
        startTime: "24:00",
        endTime: "15:30"
      })
    ).toThrow(ApiServiceError);
  });

  it("bounds calendar reads to a safe range", () => {
    expect(MAX_CALENDAR_ITEMS).toBe(2_000);
    expect(MAX_CALENDAR_RANGE_DAYS).toBe(93);
    expect(
      normalizeCalendarRange({ from: "2026-01-01", to: "2026-04-03" })
    ).toMatchObject({ from: "2026-01-01", to: "2026-04-03" });
    expect(() =>
      normalizeCalendarRange({ from: "2026-01-01", to: "2026-04-04" })
    ).toThrow("Calendar range cannot exceed 93 days");
  });

  it("queries calendar events that overlap the requested range", () => {
    const condition = getCalendarEventOverlapCondition(
      new Date("2026-07-09T21:00:00.000Z"),
      new Date("2026-07-10T20:59:59.999Z")
    );
    const query = new PgDialect().sqlToQuery(condition!);

    expect(query.sql).toBe(
      '("calendar_events"."starts_at" <= $1 and "calendar_events"."ends_at" > $2)'
    );
    expect(query.params).toEqual([
      "2026-07-10T20:59:59.999Z",
      "2026-07-09T21:00:00.000Z"
    ]);
  });
});
