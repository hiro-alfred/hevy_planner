CREATE TABLE `exercise_templates` (
	`id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`type` varchar(64) NOT NULL,
	`primary_muscle_group` varchar(64) NOT NULL,
	`secondary_muscle_groups` json NOT NULL,
	`equipment_category` varchar(64) NOT NULL,
	`is_custom` boolean NOT NULL DEFAULT false,
	`fetched_at` varchar(32) NOT NULL,
	CONSTRAINT `exercise_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request` json NOT NULL,
	`plan` json,
	`status` enum('draft','generated','synced') NOT NULL DEFAULT 'draft',
	`hevy_folder_id` int,
	`created_at` varchar(32) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(128) NOT NULL,
	`value` varchar(1024) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `sync_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plan_id` int NOT NULL,
	`day_index` int NOT NULL,
	`hevy_folder_id` int NOT NULL,
	`hevy_routine_id` varchar(64) NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`last_synced_at` varchar(32) NOT NULL,
	CONSTRAINT `sync_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_links_plan_day` UNIQUE(`plan_id`,`day_index`)
);
--> statement-breakpoint
ALTER TABLE `sync_links` ADD CONSTRAINT `sync_links_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;