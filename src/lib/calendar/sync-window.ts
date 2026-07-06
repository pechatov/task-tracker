import { getEnv } from "../env";
import { endOfMoscowDate, formatDateInput, startOfMoscowDate } from "../date";

export type CalendarSyncWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function getCalendarSyncWindow(
  now = new Date(),
  pastDays?: number,
  futureDays?: number
): CalendarSyncWindow {
  const env = getEnv();
  const resolvedPastDays = pastDays ?? env.CALENDAR_SYNC_PAST_DAYS;
  const resolvedFutureDays = futureDays ?? env.CALENDAR_SYNC_FUTURE_DAYS;
  const today = formatDateInput(now);
  const startsAt = startOfMoscowDate(addDateDays(today, -resolvedPastDays));
  const endsAt = endOfMoscowDate(addDateDays(today, resolvedFutureDays));

  return { startsAt, endsAt };
}

function addDateDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function isWithinCalendarSyncWindow(
  value: Date,
  syncWindow: CalendarSyncWindow
) {
  return value >= syncWindow.startsAt && value <= syncWindow.endsAt;
}
