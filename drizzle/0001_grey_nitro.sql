CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`username` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `access_users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `access_users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `access_users` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `access_users` ADD `password_changed_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `access_users_username_unique` ON `access_users` (`username`);--> statement-breakpoint
ALTER TABLE `employees` ADD `response_time_seconds` integer;--> statement-breakpoint
ALTER TABLE `performance_reviews` ADD `weaknesses` text;--> statement-breakpoint
ALTER TABLE `performance_reviews` ADD `improvements` text;