CREATE TABLE "eve"."onboarding" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"markets" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eve"."onboarding" ADD CONSTRAINT "onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
