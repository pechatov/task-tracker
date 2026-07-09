import { describe, expect, it } from "vitest";
import {
  ApiServiceError,
  createTimeBlockFromDateAndTimes
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
});
