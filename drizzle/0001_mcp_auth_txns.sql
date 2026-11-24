CREATE TABLE "mcp_auth_txns" (
	"state" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"code_verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_auth_txns" ADD CONSTRAINT "mcp_auth_txns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;