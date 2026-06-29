CREATE TYPE "public"."calendar_provider" AS ENUM('microsoft_graph', 'yandex_caldav');--> statement-breakpoint
CREATE TYPE "public"."calendar_source_status" AS ENUM('active', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."context_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"connected_calendar_id" uuid NOT NULL,
	"external_event_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"organizer" text,
	"attendees_summary" text,
	"event_url" text,
	"provider_updated_at" timestamp with time zone,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"display_name" text NOT NULL,
	"account_email" text,
	"status" "calendar_source_status" DEFAULT 'active' NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"encrypted_credentials" text,
	"credential_key_id" text,
	"sync_state" jsonb,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sync_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stream_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"status" "context_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"status" "context_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"day_priority" integer NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"stream_id" uuid,
	"project_id" uuid,
	"time_block_start" timestamp with time zone,
	"time_block_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_time_block_bounds_check" CHECK (
      ("tasks"."time_block_start" is null and "tasks"."time_block_end" is null)
      or
      ("tasks"."time_block_start" is not null and "tasks"."time_block_end" is not null and "tasks"."time_block_end" > "tasks"."time_block_start")
    )
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_source_id_calendar_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."calendar_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_connected_calendar_id_connected_calendars_id_fk" FOREIGN KEY ("connected_calendar_id") REFERENCES "public"."connected_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sources" ADD CONSTRAINT "calendar_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_calendars" ADD CONSTRAINT "connected_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_calendars" ADD CONSTRAINT "connected_calendars_source_id_calendar_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."calendar_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_calendar_external_unique" ON "calendar_events" USING btree ("connected_calendar_id","external_event_id");--> statement-breakpoint
CREATE INDEX "calendar_events_user_starts_at_idx" ON "calendar_events" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_source_id_idx" ON "calendar_events" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "calendar_sources_user_provider_idx" ON "calendar_sources" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_calendars_source_external_unique" ON "connected_calendars" USING btree ("source_id","external_calendar_id");--> statement-breakpoint
CREATE INDEX "connected_calendars_user_enabled_idx" ON "connected_calendars" USING btree ("user_id","is_enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_stream_name_unique" ON "projects" USING btree ("user_id","stream_id","name");--> statement-breakpoint
CREATE INDEX "projects_user_id_status_idx" ON "projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "streams_user_id_name_unique" ON "streams" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "streams_user_id_status_idx" ON "streams" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_due_date_priority_idx" ON "tasks" USING btree ("user_id","due_date","day_priority");