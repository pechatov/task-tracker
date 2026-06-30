CREATE TYPE "public"."task_size" AS ENUM('small', 'medium', 'big');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "size" "task_size" DEFAULT 'medium' NOT NULL;