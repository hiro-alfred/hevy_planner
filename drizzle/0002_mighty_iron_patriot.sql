CREATE TABLE `workout_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workout_id` varchar(64) NOT NULL,
	`exercise_template_id` varchar(64) NOT NULL,
	`exercise_title` varchar(255) NOT NULL,
	`exercise_index` int NOT NULL,
	`set_index` int NOT NULL,
	`set_type` varchar(32) NOT NULL,
	`weight_kg` double,
	`reps` int,
	`rpe` double,
	`duration_seconds` int,
	`distance_meters` int,
	CONSTRAINT `workout_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`routine_id` varchar(64),
	`start_time` varchar(32) NOT NULL,
	`end_time` varchar(32),
	`hevy_updated_at` varchar(32) NOT NULL,
	`fetched_at` varchar(32) NOT NULL,
	CONSTRAINT `workouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workout_sets` ADD CONSTRAINT `workout_sets_workout_id_workouts_id_fk` FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `workout_sets_template` ON `workout_sets` (`exercise_template_id`);--> statement-breakpoint
CREATE INDEX `workout_sets_workout` ON `workout_sets` (`workout_id`);