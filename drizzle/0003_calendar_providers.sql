ALTER TYPE "public"."calendar_provider" ADD VALUE 'exchange_ews';--> statement-breakpoint
ALTER TYPE "public"."calendar_provider" ADD VALUE 'google_calendar';--> statement-breakpoint
UPDATE "calendar_sources"
SET "status" = 'disconnected',
  "disconnected_at" = now(),
  "updated_at" = now()
WHERE "provider" = 'microsoft_graph' AND "status" = 'active';