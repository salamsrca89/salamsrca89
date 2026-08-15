CREATE TABLE `access_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`point_id` integer,
	`employee_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_users_email_unique` ON `access_users` (`email`);--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`issue_date` text,
	`expiry_date` text,
	`notes` text,
	`attachment_key` text,
	`attachment_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custody_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`point_id` integer NOT NULL,
	`device_name` text NOT NULL,
	`serial_number` text NOT NULL,
	`delivered_at` text,
	`item_condition` text DEFAULT 'سليم' NOT NULL,
	`status` text DEFAULT 'بعهدة الموظف' NOT NULL,
	`returned_at` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`point_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`employee_code` text NOT NULL,
	`mobile` text NOT NULL,
	`national_id` text NOT NULL,
	`birth_date` text NOT NULL,
	`email` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_national_id_unique` ON `employees` (`national_id`);--> statement-breakpoint
CREATE TABLE `form_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`template_id` integer,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`event_date` text NOT NULL,
	`status` text DEFAULT 'محفوظ' NOT NULL,
	`attachment_key` text,
	`attachment_name` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `form_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`template_text` text NOT NULL,
	`attachment_key` text,
	`attachment_name` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `performance_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`period` text NOT NULL,
	`score` integer NOT NULL,
	`rating` text NOT NULL,
	`notes` text,
	`reviewer_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `points_name_unique` ON `points` (`name`);