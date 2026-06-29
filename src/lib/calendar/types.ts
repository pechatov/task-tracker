export type CalendarProvider = "microsoft_graph" | "yandex_caldav";

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
  providerUpdatedAt?: Date;
};

export type ConnectedCalendarSnapshot = {
  externalCalendarId: string;
  name: string;
  color: string;
  isPrimary: boolean;
};
