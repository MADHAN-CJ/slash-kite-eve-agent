CREATE TABLE "eve"."watcher_links" (
	"watcher_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eve"."watcher_links" ADD CONSTRAINT "watcher_links_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "eve"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watcher_links_user_idx" ON "eve"."watcher_links" USING btree ("user_id");--> statement-breakpoint
-- Hand-added (as in 0000): the owner is the MCP's users row; unqualified so it resolves via search_path (public locally, prod on the DO database).
ALTER TABLE "eve"."watcher_links" ADD CONSTRAINT "watcher_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
