ALTER TABLE eve.notification_jobs ADD COLUMN provider_payload jsonb;
--> statement-breakpoint
ALTER TABLE eve.notification_jobs ADD COLUMN first_attempt_at timestamptz;
