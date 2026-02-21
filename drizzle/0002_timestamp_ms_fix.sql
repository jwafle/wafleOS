UPDATE `workouts`
SET
	`startedAt` = CASE
		WHEN `startedAt` IS NOT NULL AND `startedAt` < 1000000000000 THEN `startedAt` * 1000
		ELSE `startedAt`
	END,
	`finishedAt` = CASE
		WHEN `finishedAt` IS NOT NULL AND `finishedAt` < 1000000000000 THEN `finishedAt` * 1000
		ELSE `finishedAt`
	END;

--> statement-breakpoint

UPDATE `sets`
SET
	`finishedAt` = CASE
		WHEN `finishedAt` IS NOT NULL AND `finishedAt` < 1000000000000 THEN `finishedAt` * 1000
		ELSE `finishedAt`
	END;