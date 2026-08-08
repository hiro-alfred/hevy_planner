ALTER TABLE `plans` ADD `hevy_folder_id` integer;--> statement-breakpoint
-- Hand-added before the unique index below. A database written by the buggy
-- version could already contain two links for the same (plan_id, day_index) —
-- that is exactly the corruption the index exists to prevent. CREATE UNIQUE
-- INDEX would then fail, and since migrations run on every boot, the app would
-- refuse to start with no way out but manual SQL. Keep the earliest link per
-- day and drop the rest: the discarded rows point at duplicate Hevy routines
-- that were already stranded (the API has no DELETE), so nothing recoverable
-- is lost here.
DELETE FROM `sync_links` WHERE `id` NOT IN (SELECT MIN(`id`) FROM `sync_links` GROUP BY `plan_id`, `day_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_links_plan_day` ON `sync_links` (`plan_id`,`day_index`);
