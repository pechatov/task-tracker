import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const taskStatus = pgEnum("task_status", [
  "open",
  "done",
  "cancelled"
]);

export const taskSize = pgEnum("task_size", ["small", "medium", "big"]);

export const contextStatus = pgEnum("context_status", [
  "active",
  "completed"
]);

export const recurringTaskFrequency = pgEnum("recurring_task_frequency", [
  "daily",
  "weekly",
  "monthly"
]);

export const recurringTaskStatus = pgEnum("recurring_task_status", [
  "active",
  "paused"
]);

export const calendarProvider = pgEnum("calendar_provider", [
  "microsoft_graph",
  "yandex_caldav"
]);

export const calendarSourceStatus = pgEnum("calendar_source_status", [
  "active",
  "disconnected"
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  ...timestamps
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt)
  })
);

export const streams = pgTable(
  "streams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    status: contextStatus("status").default("active").notNull(),
    ...timestamps
  },
  (table) => ({
    userNameUnique: uniqueIndex("streams_user_id_name_unique").on(
      table.userId,
      table.name
    ),
    userStatusIdx: index("streams_user_id_status_idx").on(
      table.userId,
      table.status
    )
  })
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    status: contextStatus("status").default("active").notNull(),
    ...timestamps
  },
  (table) => ({
    userStreamNameUnique: uniqueIndex("projects_user_stream_name_unique").on(
      table.userId,
      table.streamId,
      table.name
    ),
    userStatusIdx: index("projects_user_id_status_idx").on(
      table.userId,
      table.status
    )
  })
);

export const recurringTasks = pgTable(
  "recurring_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    dayPriority: integer("day_priority").default(1).notNull(),
    status: recurringTaskStatus("status").default("active").notNull(),
    size: taskSize("size").default("medium").notNull(),
    streamId: uuid("stream_id").references(() => streams.id, {
      onDelete: "set null"
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null"
    }),
    frequency: recurringTaskFrequency("frequency").notNull(),
    interval: integer("interval").default(1).notNull(),
    dayOfWeek: integer("day_of_week"),
    dayOfMonth: integer("day_of_month"),
    timeBlockStartMinutes: integer("time_block_start_minutes"),
    timeBlockEndMinutes: integer("time_block_end_minutes"),
    ...timestamps
  },
  (table) => ({
    userStatusIdx: index("recurring_tasks_user_id_status_idx").on(
      table.userId,
      table.status
    ),
    userStartDateIdx: index("recurring_tasks_user_id_start_date_idx").on(
      table.userId,
      table.startDate
    ),
    intervalCheck: check("recurring_tasks_interval_check", sql`
      ${table.interval} > 0
    `),
    dateBoundsCheck: check("recurring_tasks_date_bounds_check", sql`
      ${table.endDate} is null or ${table.endDate} >= ${table.startDate}
    `),
    dayOfWeekCheck: check("recurring_tasks_day_of_week_check", sql`
      ${table.dayOfWeek} is null or (${table.dayOfWeek} >= 0 and ${table.dayOfWeek} <= 6)
    `),
    dayOfMonthCheck: check("recurring_tasks_day_of_month_check", sql`
      ${table.dayOfMonth} is null or (${table.dayOfMonth} >= 1 and ${table.dayOfMonth} <= 31)
    `),
    timeBlockCheck: check("recurring_tasks_time_block_bounds_check", sql`
      (${table.timeBlockStartMinutes} is null or (${table.timeBlockStartMinutes} >= 0 and ${table.timeBlockStartMinutes} < 1440))
      and
      (${table.timeBlockEndMinutes} is null or (${table.timeBlockEndMinutes} > 0 and ${table.timeBlockEndMinutes} <= 1440))
      and
      (${table.timeBlockEndMinutes} is null or (${table.timeBlockStartMinutes} is not null and ${table.timeBlockEndMinutes} > ${table.timeBlockStartMinutes}))
    `)
  })
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date", { mode: "string" }),
    dayPriority: integer("day_priority").notNull(),
    status: taskStatus("status").default("open").notNull(),
    size: taskSize("size").default("medium").notNull(),
    streamId: uuid("stream_id").references(() => streams.id, {
      onDelete: "set null"
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null"
    }),
    recurringTaskId: uuid("recurring_task_id").references(
      () => recurringTasks.id,
      { onDelete: "set null" }
    ),
    recurringOccurrenceDate: date("recurring_occurrence_date", {
      mode: "string"
    }),
    timeBlockStart: timestamp("time_block_start", { withTimezone: true }),
    timeBlockEnd: timestamp("time_block_end", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    userDueDateIdx: index("tasks_user_id_due_date_idx").on(
      table.userId,
      table.dueDate
    ),
    userStatusIdx: index("tasks_user_id_status_idx").on(
      table.userId,
      table.status
    ),
    userDueDatePriorityIdx: index("tasks_user_due_date_priority_idx").on(
      table.userId,
      table.dueDate,
      table.dayPriority
    ),
    recurringTaskIdx: index("tasks_recurring_task_id_idx").on(
      table.recurringTaskId
    ),
    recurringOccurrenceUnique: uniqueIndex(
      "tasks_recurring_occurrence_unique"
    ).on(table.recurringTaskId, table.recurringOccurrenceDate),
    timeBlockCheck: check("tasks_time_block_bounds_check", sql`
      (${table.timeBlockStart} is null and ${table.timeBlockEnd} is null)
      or
      (${table.timeBlockStart} is not null and ${table.timeBlockEnd} is not null and ${table.timeBlockEnd} > ${table.timeBlockStart})
    `)
  })
);

export const calendarSources = pgTable(
  "calendar_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: calendarProvider("provider").notNull(),
    displayName: text("display_name").notNull(),
    accountEmail: text("account_email"),
    status: calendarSourceStatus("status").default("active").notNull(),
    readOnly: boolean("read_only").default(true).notNull(),
    encryptedCredentials: text("encrypted_credentials"),
    credentialKeyId: text("credential_key_id"),
    syncState: jsonb("sync_state").$type<Record<string, unknown> | null>(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    userProviderIdx: index("calendar_sources_user_provider_idx").on(
      table.userId,
      table.provider
    )
  })
);

export const connectedCalendars = pgTable(
  "connected_calendars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => calendarSources.id, { onDelete: "cascade" }),
    externalCalendarId: text("external_calendar_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    isEnabled: boolean("is_enabled").default(false).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    syncState: jsonb("sync_state").$type<Record<string, unknown> | null>(),
    ...timestamps
  },
  (table) => ({
    sourceExternalUnique: uniqueIndex(
      "connected_calendars_source_external_unique"
    ).on(table.sourceId, table.externalCalendarId),
    userEnabledIdx: index("connected_calendars_user_enabled_idx").on(
      table.userId,
      table.isEnabled
    )
  })
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => calendarSources.id, { onDelete: "cascade" }),
    connectedCalendarId: uuid("connected_calendar_id")
      .notNull()
      .references(() => connectedCalendars.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    isAllDay: boolean("is_all_day").default(false).notNull(),
    location: text("location"),
    organizer: text("organizer"),
    attendeesSummary: text("attendees_summary"),
    eventUrl: text("event_url"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    ...timestamps
  },
  (table) => ({
    calendarExternalUnique: uniqueIndex(
      "calendar_events_calendar_external_unique"
    ).on(table.connectedCalendarId, table.externalEventId),
    userStartIdx: index("calendar_events_user_starts_at_idx").on(
      table.userId,
      table.startsAt
    ),
    sourceIdx: index("calendar_events_source_id_idx").on(table.sourceId)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  streams: many(streams),
  projects: many(projects),
  recurringTasks: many(recurringTasks),
  tasks: many(tasks),
  calendarSources: many(calendarSources)
}));

export const streamsRelations = relations(streams, ({ one, many }) => ({
  user: one(users, {
    fields: [streams.userId],
    references: [users.id]
  }),
  projects: many(projects),
  recurringTasks: many(recurringTasks),
  tasks: many(tasks)
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id]
  }),
  stream: one(streams, {
    fields: [projects.streamId],
    references: [streams.id]
  }),
  recurringTasks: many(recurringTasks),
  tasks: many(tasks)
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id]
  }),
  stream: one(streams, {
    fields: [tasks.streamId],
    references: [streams.id]
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id]
  }),
  recurringTask: one(recurringTasks, {
    fields: [tasks.recurringTaskId],
    references: [recurringTasks.id]
  })
}));

export const recurringTasksRelations = relations(
  recurringTasks,
  ({ one, many }) => ({
    user: one(users, {
      fields: [recurringTasks.userId],
      references: [users.id]
    }),
    stream: one(streams, {
      fields: [recurringTasks.streamId],
      references: [streams.id]
    }),
    project: one(projects, {
      fields: [recurringTasks.projectId],
      references: [projects.id]
    }),
    tasks: many(tasks)
  })
);

export const calendarSourcesRelations = relations(
  calendarSources,
  ({ one, many }) => ({
    user: one(users, {
      fields: [calendarSources.userId],
      references: [users.id]
    }),
    calendars: many(connectedCalendars),
    events: many(calendarEvents)
  })
);

export const connectedCalendarsRelations = relations(
  connectedCalendars,
  ({ one, many }) => ({
    user: one(users, {
      fields: [connectedCalendars.userId],
      references: [users.id]
    }),
    source: one(calendarSources, {
      fields: [connectedCalendars.sourceId],
      references: [calendarSources.id]
    }),
    events: many(calendarEvents)
  })
);

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id]
  }),
  source: one(calendarSources, {
    fields: [calendarEvents.sourceId],
    references: [calendarSources.id]
  }),
  calendar: one(connectedCalendars, {
    fields: [calendarEvents.connectedCalendarId],
    references: [connectedCalendars.id]
  })
}));
