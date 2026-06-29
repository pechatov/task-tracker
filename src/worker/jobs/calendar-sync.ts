import { getCalendarSyncWindow } from "../../lib/calendar/sync-window";

export async function syncEnabledCalendarsForUser(userId: string) {
  const syncWindow = getCalendarSyncWindow();

  console.info("calendar sync placeholder", {
    userId,
    startsAt: syncWindow.startsAt.toISOString(),
    endsAt: syncWindow.endsAt.toISOString()
  });
}
