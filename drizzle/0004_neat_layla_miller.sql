CREATE TABLE `employee_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`report_year` integer NOT NULL,
	`report_month` integer NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`total_rows` integer NOT NULL,
	`accepted_rows` integer NOT NULL,
	`excluded_rows` integer NOT NULL,
	`new_rows` integer NOT NULL,
	`updated_rows` integer NOT NULL,
	`archived_rows` integer NOT NULL,
	`preview_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`point_id` integer,
	`full_name` text NOT NULL,
	`employee_code` text NOT NULL,
	`mobile` text NOT NULL,
	`national_id` text,
	`birth_date` text,
	`email` text,
	`team_code` text,
	`job_nature` text,
	`managed_by_import` integer DEFAULT false NOT NULL,
	`response_time_seconds` integer,
	`emergency_response_seconds` integer,
	`echo_response_seconds` integer,
	`incident_response_seconds` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_employees`("id", "point_id", "full_name", "employee_code", "mobile", "national_id", "birth_date", "email", "team_code", "job_nature", "managed_by_import", "response_time_seconds", "emergency_response_seconds", "echo_response_seconds", "incident_response_seconds", "active", "created_at", "updated_at") SELECT "id", "point_id", "full_name", "employee_code", "mobile", "national_id", "birth_date", "email", NULL, NULL, 0, "response_time_seconds", "emergency_response_seconds", "echo_response_seconds", "incident_response_seconds", "active", "created_at", "updated_at" FROM `employees`;--> statement-breakpoint
DROP TABLE `employees`;--> statement-breakpoint
ALTER TABLE `__new_employees` RENAME TO `employees`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_national_id_unique` ON `employees` (`national_id`);
