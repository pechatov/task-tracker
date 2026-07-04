CREATE TYPE "public"."recurring_task_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."recurring_task_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "recurring_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"day_priority" integer DEFAULT 1 NOT NULL,
	"status" "recurring_task_status" DEFAULT 'active' NOT NULL,
	"size" "task_size" DEFAULT 'medium' NOT NULL,
	"stream_id" uuid,
	"project_id" uuid,
	"frequency" "recurring_task_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"time_block_start_minutes" integer,
	"time_block_end_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_tasks_interval_check" CHECK (
      "recurring_tasks"."interval" > 0
    ),
	CONSTRAINT "recurring_tasks_date_bounds_check" CHECK (
      "recurring_tasks"."end_date" is null or "recurring_tasks"."end_date" >= "recurring_tasks"."start_date"
    ),
	CONSTRAINT "recurring_tasks_day_of_week_check" CHECK (
      "recurring_tasks"."day_of_week" is null or ("recurring_tasks"."day_of_week" >= 0 and "recurring_tasks"."day_of_week" <= 6)
    ),
	CONSTRAINT "recurring_tasks_day_of_month_check" CHECK (
      "recurring_tasks"."day_of_month" is null or ("recurring_tasks"."day_of_month" >= 1 and "recurring_tasks"."day_of_month" <= 31)
    ),
	CONSTRAINT "recurring_tasks_time_block_bounds_check" CHECK (
      ("recurring_tasks"."time_block_start_minutes" is null or ("recurring_tasks"."time_block_start_minutes" >= 0 and "recurring_tasks"."time_block_start_minutes" < 1440))
      and
      ("recurring_tasks"."time_block_end_minutes" is null or ("recurring_tasks"."time_block_end_minutes" > 0 and "recurring_tasks"."time_block_end_minutes" <= 1440))
      and
      ("recurring_tasks"."time_block_end_minutes" is null or ("recurring_tasks"."time_block_start_minutes" is not null and "recurring_tasks"."time_block_end_minutes" > "recurring_tasks"."time_block_start_minutes"))
    )
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurring_task_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurring_occurrence_date" date;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_tasks_user_id_status_idx" ON "recurring_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "recurring_tasks_user_id_start_date_idx" ON "recurring_tasks" USING btree ("user_id","start_date");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_task_id_recurring_tasks_id_fk" FOREIGN KEY ("recurring_task_id") REFERENCES "public"."recurring_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_recurring_task_id_idx" ON "tasks" USING btree ("recurring_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_recurring_occurrence_unique" ON "tasks" USING btree ("recurring_task_id","recurring_occurrence_date");