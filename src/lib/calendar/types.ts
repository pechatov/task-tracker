export type CalendarProvider =
  | "microsoft_graph"
  | "yandex_caldav"
  | "exchange_ews"
  | "google_calendar"
  | "browser_session"
  | "local_bridge";

export type CalendarEventStatus = "confirmed" | "cancelled";

export function normalizeCalendarEventStatus(
  status: string | undefined
): CalendarEventStatus {
  return status === "cancelled" || status === "canceled"
    ? "cancelled"
    : "confirmed";
}

// Exchange/Outlook cancellations often keep STATUS=CONFIRMED and only rename
// the subject, so the localized title prefix is the reliable signal.
const cancelledTitlePrefixes = [
  "canceled:",
  "cancelled:",
  "отменено:",
  "отменена:"
];

export function hasCancelledTitlePrefix(title: string) {
  const normalized = title.trim().toLowerCase();
  return cancelledTitlePrefixes.some((prefix) => normalized.startsWith(prefix));
}

export function formatCalendarEventTitle(
  title: string,
  status: CalendarEventStatus
) {
  return status === "cancelled" ? `${title} (canceled)` : title;
}

export type CalendarEventSnapshot = {
  externalEventId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  location?: string;
  organizer?: string;
  attendeesSummary?: string;
  eventUrl?: string;
  status: CalendarEventStatus;
  providerUpdatedAt?: Date;
};

export type ConnectedCalendarSnapshot = {
  externalCalendarId: string;
  name: string;
  color: string;
  isPrimary: boolean;
};
