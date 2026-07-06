import { describe, expect, it } from "vitest";
import {
  getRecurringOccurrenceDates,
  parseTimeToMinutes
} from "../src/lib/recurring-tasks/schedule";

describe("recurring task schedule", () => {
  it("generates weekly dates on the selected weekday", () => {
    expect(
      getRecurringOccurrenceDates(
        {
          dayOfMonth: null,
          dayOfWeek: 3,
          endDate: null,
          frequency: "weekly",
          interval: 1,
          startDate: "2026-07-01"
        },
        "2026-07-01",
        "2026-07-15"
      )
    ).toEqual(["2026-07-01", "2026-07-08", "2026-07-15"]);
  });

  it("honors daily intervals", () => {
    expect(
      getRecurringOccurrenceDates(
        {
          dayOfMonth: null,
          dayOfWeek: null,
          endDate: "2026-07-08",
          frequency: "daily",
          interval: 2,
          startDate: "2026-07-02"
        },
        "2026-07-01",
        "2026-07-10"
      )
    ).toEqual(["2026-07-02", "2026-07-04", "2026-07-06", "2026-07-08"]);
  });

  it("skips missing month days", () => {
    expect(
      getRecurringOccurrenceDates(
        {
          dayOfMonth: 31,
          dayOfWeek: null,
          endDate: null,
          frequency: "monthly",
          interval: 1,
          startDate: "2026-01-31"
        },
        "2026-01-01",
        "2026-03-31"
      )
    ).toEqual(["2026-01-31", "2026-03-31"]);
  });

  it("parses HH:mm values as minutes from midnight", () => {
    expect(parseTimeToMinutes("21:00")).toBe(1260);
  });
});
