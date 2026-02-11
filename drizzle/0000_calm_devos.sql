CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`measured_in` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "measured_in_check" CHECK("exercises"."measured_in" IN ('duration', 'reps', 'reps_and_weight'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `name_measured_in_unique` ON `exercises` (`name`,`measured_in`);--> statement-breakpoint
CREATE TABLE `set_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise` integer NOT NULL,
	`workout` integer NOT NULL,
	`index` integer NOT NULL,
	`restDuration` integer DEFAULT 150 NOT NULL,
	`isSuperset` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`exercise`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "index_check" CHECK("set_groups"."index" > -1),
	CONSTRAINT "rest_duration_check" CHECK("set_groups"."restDuration" >= 0),
	CONSTRAINT "is_superset_check" CHECK("set_groups"."isSuperset" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_index_unique` ON `set_groups` (`workout`,`index`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise` integer NOT NULL,
	`setGroup` integer NOT NULL,
	`workout` integer NOT NULL,
	`index` integer NOT NULL,
	`type` text DEFAULT 'working' NOT NULL,
	`reps` integer,
	`weight` real,
	`duration` integer,
	FOREIGN KEY (`exercise`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`setGroup`) REFERENCES `set_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "index_check" CHECK("sets"."index" > -1),
	CONSTRAINT "type_check" CHECK("sets"."type" IN ('warmup', 'working')),
	CONSTRAINT "reps_check" CHECK("sets"."reps" > 0 OR "sets"."reps" IS NULL),
	CONSTRAINT "weight_check" CHECK("sets"."weight" > 0 OR "sets"."weight" IS NULL),
	CONSTRAINT "duration_check" CHECK("sets"."duration" > 0 OR "sets"."duration" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_group_index_unique` ON `sets` (`setGroup`,`index`);--> statement-breakpoint
CREATE TABLE `template_set_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise` integer NOT NULL,
	`template` integer NOT NULL,
	`index` integer NOT NULL,
	`restDuration` integer DEFAULT 150 NOT NULL,
	`isSuperset` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`exercise`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "index_check" CHECK("template_set_groups"."index" > -1),
	CONSTRAINT "rest_duration_check" CHECK("template_set_groups"."restDuration" >= 0),
	CONSTRAINT "is_superset_check" CHECK("template_set_groups"."isSuperset" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_index_unique` ON `template_set_groups` (`template`,`index`);--> statement-breakpoint
CREATE TABLE `template_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise` integer NOT NULL,
	`templateSetGroup` integer NOT NULL,
	`template` integer NOT NULL,
	`index` integer NOT NULL,
	`type` text DEFAULT 'working' NOT NULL,
	FOREIGN KEY (`exercise`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`templateSetGroup`) REFERENCES `template_set_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "index_check" CHECK("template_sets"."index" > -1),
	CONSTRAINT "type_check" CHECK("template_sets"."type" IN ('warmup', 'working'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_set_group_index_unique` ON `template_sets` (`templateSetGroup`,`index`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `name_unique` ON `templates` (`name`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template` integer NOT NULL,
	`startedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`finishedAt` integer,
	FOREIGN KEY (`template`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
