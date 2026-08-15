CREATE TABLE `trainee_profile` (
	`id` int NOT NULL,
	`profile` json NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `trainee_profile_id` PRIMARY KEY(`id`)
);
