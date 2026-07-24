import { describe, expect, it } from "vitest";
import { parseMicrosoftDateTime } from "../src/lib/calendar/microsoft";
import { mapMicrosoftEvent } from "../src/lib/calendar/sync";

describe("Microsoft Graph calendar helpers", () => {
  it("parses UTC dateTime values returned with a separate timezone", () => {
    expect(
      parseMicrosoftDateTime({
        dateTime: "2026-07-06T09:00:00.0000000",
        timeZone: "UTC"
      })?.toISOString()
    ).toBe("2026-07-06T09:00:00.000Z");
  });

  it("keeps explicit offsets when present", () => {
    expect(
      parseMicrosoftDateTime({
        dateTime: "2026-07-06T12:00:00+03:00",
        timeZone: "Russian Standard Time"
      })?.toISOString()
    ).toBe("2026-07-06T09:00:00.000Z");
  });

  it("maps a cancelled Graph event to a cancelled calendar snapshot", () => {
    expect(
      mapMicrosoftEvent({
        id: "event-1",
        isCancelled: true,
        subject: "ml section sync",
        start: {
          dateTime: "2026-07-24T12:00:00.0000000",
          timeZone: "UTC"
        },
        end: {
          dateTime: "2026-07-24T12:30:00.0000000",
          timeZone: "UTC"
        }
      })
    ).toMatchObject({
      externalEventId: "event-1",
      status: "cancelled",
      title: "ml section sync"
    });
  });
});
