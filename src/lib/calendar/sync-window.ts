export type CalendarSyncWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function getCalendarSyncWindow(
  now = new Date(),
  pastDays = 60,
  futureDays = 60
): CalendarSyncWindow {
  const startsAt = new Date(now);
  startsAt.setUTCDate(startsAt.getUTCDate() - pastDays);
  startsAt.setUTCHours(0, 0, 0, 0);

  const endsAt = new Date(now);
  endsAt.setUTCDate(endsAt.getUTCDate() + futureDays);
  endsAt.setUTCHours(23, 59, 59, 999);

  return { startsAt, endsAt };
}

export function isWithinCalendarSyncWindow(
  value: Date,
  syncWindow: CalendarSyncWindow
) {
  return value >= syncWindow.startsAt && value <= syncWindow.endsAt;
}
