ALTER TABLE "board" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "board" ADD CONSTRAINT "board_share_token_unique" UNIQUE("share_token");