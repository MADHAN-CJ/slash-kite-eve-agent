CREATE SCHEMA "eve";
--> statement-breakpoint
CREATE TABLE "eve"."mcp_grants" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"turn_sequence" integer NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage" jsonb,
	"cost" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve"."session_context" (
	"eve_session_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve"."threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eve_session_id" text NOT NULL,
	"user_id" uuid,
	"continuation_token" text,
	"busy_since" timestamp with time zone,
	"stream_index" integer DEFAULT 0 NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "threads_eve_session_id_unique" UNIQUE("eve_session_id")
);
--> statement-breakpoint
ALTER TABLE "eve"."messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "eve"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "eve"."messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_assistant_turn_uidx" ON "eve"."messages" USING btree ("thread_id","turn_sequence") WHERE "eve"."messages"."role" = 'assistant';--> statement-breakpoint
CREATE INDEX "threads_user_idx" ON "eve"."threads" USING btree ("user_id");--> statement-breakpoint
-- Hand-written: eve.* rows belong to MCP users. The target is deliberately UNQUALIFIED so it resolves
-- through search_path: `public.users` locally, `prod.users` on the shared production database
-- (DATABASE_URL carries `options=-csearch_path=prod` there, like the MCP's own URL).
ALTER TABLE "eve"."mcp_grants" ADD CONSTRAINT "mcp_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve"."threads" ADD CONSTRAINT "threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
