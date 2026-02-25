DROP INDEX `name_measured_in_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_name_ci_unique` ON `exercises` (lower(trim("name")));