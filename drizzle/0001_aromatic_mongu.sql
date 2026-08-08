ALTER TABLE `plans` ADD `hevy_folder_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `sync_links_plan_day` ON `sync_links` (`plan_id`,`day_index`);