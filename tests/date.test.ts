import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  formatDateInput,
  formatDisplayTime,
  formatTimeInput,
  startOfMoscowDate
} from "../src/lib/date";

describe("date helpers", () => {
  it("formats dates in Moscow time", () => {
    expect(formatDateInput(new Date("2026-07-06T20:59:00.000Z"))).toBe(
      "2026-07-06"
    );
    expect(formatDateInput(new Date("2026-07-06T21:00:00.000Z"))).toBe(
      "2026-07-07"
    );
  });

  it("builds task time blocks as Moscow wall-clock time", () => {
    const date = combineDateAndTime("2026-07-07", "10:30");

    expect(date.toISOString()).toBe("2026-07-07T07:30:00.000Z");
    expect(formatTimeInput(date)).toBe("10:30");
    expect(formatDisplayTime(date)).toBe("10:30");
  });

  it("returns Moscow day boundaries as UTC instants", () => {
    expect(startOfMoscowDate("2026-07-07").toISOString()).toBe(
      "2026-07-06T21:00:00.000Z"
    );
  });
});
