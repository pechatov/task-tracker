import { syncEnabledCalendarsForUser as syncUserCalendars } from "../../lib/calendar/sync";

export async function syncEnabledCalendarsForUser(userId: string) {
  await syncUserCalendars(userId);
}
