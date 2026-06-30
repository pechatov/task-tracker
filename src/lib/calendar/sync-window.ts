import { getEnv } from "@/lib/env";

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
  const startsAt = new Date(now);
  startsAt.setUTCDate(startsAt.getUTCDate() - resolvedPastDays);
  startsAt.setUTCHours(0, 0, 0, 0);

  const endsAt = new Date(now);
  endsAt.setUTCDate(endsAt.getUTCDate() + resolvedFutureDays);
  endsAt.setUTCHours(23, 59, 59, 999);

  return { startsAt, endsAt };
}

export function isWithinCalendarSyncWindow(
  value: Date,
  syncWindow: CalendarSyncWindow
) {
  return value >= syncWindow.startsAt && value <= syncWindow.endsAt;
}
