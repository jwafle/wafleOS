import { form, query } from '$app/server';
import { db } from '$lib/server/db/db';
import {
	exercisesTable,
	workoutsTable,
	setGroupsTable,
	setsTable,
	templateSetGroupsTable,
	templateSetsTable
} from '$lib/server/db/schema';
import { z } from 'zod';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { error, invalid, redirect } from '@sveltejs/kit';

const idField = z
	.string()
	.refine((value) => /^\d+$/.test(value), { message: 'Must be a positive integer' })
	.transform((value) => Number(value))
	.refine((value) => Number.isInteger(value) && value > 0, {
		message: 'Must be a positive integer'
	});

const metricValueField = z.string().optional();
const indexOffset = 1_000_000;
const epochMsNow = sql`CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;

type ExerciseMeasure = 'duration' | 'reps' | 'reps_and_weight';

type ParsedInt = { valid: true; value: number | null } | { valid: false };
type ParsedFloat = { valid: true; value: number | null } | { valid: false };

const parseOptionalPositiveInt = (value: string | undefined): ParsedInt => {
	const trimmed = value?.trim() ?? '';
	if (trimmed === '') {
		return { valid: true, value: null };
	}

	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return { valid: false };
	}

	return { valid: true, value: parsed };
};

const parseOptionalPositiveFloat = (value: string | undefined): ParsedFloat => {
	const trimmed = value?.trim() ?? '';
	if (trimmed === '') {
		return { valid: true, value: null };
	}

	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return { valid: false };
	}

	return { valid: true, value: parsed };
};

const missingMetricMessage = (measure: ExerciseMeasure) => {
	switch (measure) {
		case 'duration':
			return 'Duration is required to complete this set';
		case 'reps':
			return 'Reps are required to complete this set';
		case 'reps_and_weight':
			return 'Reps and weight are required to complete this set';
	}
};

const reindexSetGroups = async (
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	workoutId: number,
	orderedSetGroupIds: number[]
) => {
	await tx
		.update(setGroupsTable)
		.set({ index: sql`${setGroupsTable.index} + ${indexOffset}` })
		.where(eq(setGroupsTable.workout, workoutId));

	for (const [index, id] of orderedSetGroupIds.entries()) {
		await tx
			.update(setGroupsTable)
			.set({ index })
			.where(and(eq(setGroupsTable.id, id), eq(setGroupsTable.workout, workoutId)));
	}
};

const reindexSets = async (
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	setGroupId: number,
	orderedSetIds: number[]
) => {
	await tx
		.update(setsTable)
		.set({ index: sql`${setsTable.index} + ${indexOffset}` })
		.where(eq(setsTable.setGroup, setGroupId));

	for (const [index, id] of orderedSetIds.entries()) {
		await tx
			.update(setsTable)
			.set({ index })
			.where(and(eq(setsTable.id, id), eq(setsTable.setGroup, setGroupId)));
	}
};

export const startWorkout = form(z.object({ templateId: idField }), async ({ templateId }) => {
	let workoutId: number | null = null;

	await db.transaction(async (tx) => {
		const [newWorkout] = await tx
			.insert(workoutsTable)
			.values({ template: templateId, startedAt: epochMsNow })
			.returning({ id: workoutsTable.id });
		workoutId = newWorkout.id;

		const templateGroups = await tx
			.select()
			.from(templateSetGroupsTable)
			.where(eq(templateSetGroupsTable.template, templateId))
			.orderBy(asc(templateSetGroupsTable.index));

		for (const group of templateGroups) {
			const [newSetGroup] = await tx
				.insert(setGroupsTable)
				.values({
					exercise: group.exercise,
					workout: newWorkout.id,
					index: group.index,
					restDuration: group.restDuration,
					isSuperset: group.isSuperset
				})
				.returning({ id: setGroupsTable.id });
			const newSetGroupId = newSetGroup.id;

			const templateSets = await tx
				.select()
				.from(templateSetsTable)
				.where(eq(templateSetsTable.templateSetGroup, group.id))
				.orderBy(asc(templateSetsTable.index));

			const setsToInsert = templateSets.map((set) => ({
				exercise: set.exercise,
				setGroup: newSetGroupId,
				workout: newWorkout.id,
				index: set.index,
				type: set.type
			}));

			if (setsToInsert.length > 0) {
				await tx.insert(setsTable).values(setsToInsert);
			}
		}
	});

	if (workoutId === null) {
		error(500, { message: 'Failed to create workout' });
	}

	redirect(303, `/fitness/workouts/${workoutId}`);
});

export const deleteWorkout = form(z.object({ workoutId: idField }), async ({ workoutId }) => {
	await db.delete(workoutsTable).where(eq(workoutsTable.id, workoutId));
	redirect(303, '/fitness');
});

export const getExercisesForPicker = query(async () => {
	return await db
		.select({
			id: exercisesTable.id,
			name: exercisesTable.name,
			measuredIn: exercisesTable.measured_in
		})
		.from(exercisesTable)
		.orderBy(asc(exercisesTable.name));
});

export const addSetGroup = form(
	z.object({
		workoutId: idField,
		exerciseId: idField
	}),
	async ({ workoutId, exerciseId }) => {
		await db.transaction(async (tx) => {
			const workout = await tx.query.workoutsTable.findFirst({
				where: eq(workoutsTable.id, workoutId),
				columns: { id: true }
			});

			if (!workout) {
				error(404, { message: 'Workout not found' });
			}

			const existingSetGroup = await tx
				.select({ index: setGroupsTable.index })
				.from(setGroupsTable)
				.where(eq(setGroupsTable.workout, workoutId))
				.orderBy(desc(setGroupsTable.index))
				.limit(1);

			const nextIndex =
				existingSetGroup.at(0)?.index !== undefined ? existingSetGroup[0].index + 1 : 0;

			await tx.insert(setGroupsTable).values({
				workout: workoutId,
				exercise: exerciseId,
				index: nextIndex,
				restDuration: 150,
				isSuperset: false
			});
		});
	}
);

export const removeSetGroup = form(
	z.object({
		workoutId: idField,
		setGroupId: idField
	}),
	async ({ workoutId, setGroupId }) => {
		await db.transaction(async (tx) => {
			const setGroup = await tx.query.setGroupsTable.findFirst({
				where: and(eq(setGroupsTable.id, setGroupId), eq(setGroupsTable.workout, workoutId)),
				columns: { id: true }
			});

			if (!setGroup) {
				error(404, { message: 'Set group not found for workout' });
			}

			await tx.delete(setGroupsTable).where(eq(setGroupsTable.id, setGroupId));

			const remainingSetGroupIds = await tx
				.select({ id: setGroupsTable.id })
				.from(setGroupsTable)
				.where(eq(setGroupsTable.workout, workoutId))
				.orderBy(asc(setGroupsTable.index));

			await reindexSetGroups(
				tx,
				workoutId,
				remainingSetGroupIds.map((setGroupRow) => setGroupRow.id)
			);
		});
	}
);

export const moveSetGroup = form(
	z.object({
		workoutId: idField,
		setGroupId: idField,
		direction: z.enum(['up', 'down'])
	}),
	async ({ workoutId, setGroupId, direction }) => {
		await db.transaction(async (tx) => {
			const orderedSetGroups = await tx
				.select({ id: setGroupsTable.id })
				.from(setGroupsTable)
				.where(eq(setGroupsTable.workout, workoutId))
				.orderBy(asc(setGroupsTable.index));

			const currentIndex = orderedSetGroups.findIndex((setGroup) => setGroup.id === setGroupId);
			if (currentIndex === -1) {
				error(404, { message: 'Set group not found for workout' });
			}

			const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
			if (targetIndex < 0 || targetIndex >= orderedSetGroups.length) {
				return;
			}

			const [movedSetGroup] = orderedSetGroups.splice(currentIndex, 1);
			orderedSetGroups.splice(targetIndex, 0, movedSetGroup);

			await reindexSetGroups(
				tx,
				workoutId,
				orderedSetGroups.map((setGroup) => setGroup.id)
			);
		});
	}
);

export const addSetToGroup = form(
	z.object({
		workoutId: idField,
		setGroupId: idField
	}),
	async ({ workoutId, setGroupId }) => {
		await db.transaction(async (tx) => {
			const setGroup = await tx.query.setGroupsTable.findFirst({
				where: and(eq(setGroupsTable.id, setGroupId), eq(setGroupsTable.workout, workoutId)),
				columns: { id: true, exercise: true }
			});

			if (!setGroup) {
				error(404, { message: 'Set group not found for workout' });
			}

			const existingSet = await tx
				.select({ index: setsTable.index })
				.from(setsTable)
				.where(eq(setsTable.setGroup, setGroupId))
				.orderBy(desc(setsTable.index))
				.limit(1);

			const nextIndex = existingSet.at(0)?.index !== undefined ? existingSet[0].index + 1 : 0;

			await tx.insert(setsTable).values({
				workout: workoutId,
				setGroup: setGroupId,
				exercise: setGroup.exercise,
				index: nextIndex,
				type: 'working'
			});
		});
	}
);

export const updateSetMetrics = form(
	z.object({
		workoutId: idField,
		setId: idField,
		reps: metricValueField,
		weight: metricValueField,
		duration: metricValueField
	}),
	async ({ workoutId, setId, reps, weight, duration }, issue) => {
		const set = await db.query.setsTable.findFirst({
			where: and(eq(setsTable.id, setId), eq(setsTable.workout, workoutId)),
			columns: { id: true },
			with: {
				exercise: {
					columns: {
						measured_in: true
					}
				}
			}
		});

		if (!set) {
			error(404, { message: 'Set not found for workout' });
		}

		const parsedReps = parseOptionalPositiveInt(reps);
		if (!parsedReps.valid) {
			invalid(issue.reps('Reps must be a positive integer'));
		}

		const parsedWeight = parseOptionalPositiveFloat(weight);
		if (!parsedWeight.valid) {
			invalid(issue.weight('Weight must be a positive number'));
		}

		const parsedDuration = parseOptionalPositiveInt(duration);
		if (!parsedDuration.valid) {
			invalid(issue.duration('Duration must be a positive integer in seconds'));
		}

		const measure = set.exercise.measured_in;
		if (measure === 'duration') {
			await db
				.update(setsTable)
				.set({ duration: parsedDuration.value, reps: null, weight: null })
				.where(eq(setsTable.id, setId));
			return;
		}

		if (measure === 'reps') {
			await db
				.update(setsTable)
				.set({ reps: parsedReps.value, weight: null, duration: null })
				.where(eq(setsTable.id, setId));
			return;
		}

		await db
			.update(setsTable)
			.set({ reps: parsedReps.value, weight: parsedWeight.value, duration: null })
			.where(eq(setsTable.id, setId));
	}
);

export const removeSetFromGroup = form(
	z.object({
		workoutId: idField,
		setGroupId: idField,
		setId: idField
	}),
	async ({ workoutId, setGroupId, setId }) => {
		await db.transaction(async (tx) => {
			const setGroup = await tx.query.setGroupsTable.findFirst({
				where: and(eq(setGroupsTable.id, setGroupId), eq(setGroupsTable.workout, workoutId)),
				columns: { id: true }
			});

			if (!setGroup) {
				error(404, { message: 'Set group not found for workout' });
			}

			const set = await tx.query.setsTable.findFirst({
				where: and(
					eq(setsTable.id, setId),
					eq(setsTable.setGroup, setGroupId),
					eq(setsTable.workout, workoutId)
				),
				columns: { id: true }
			});

			if (!set) {
				error(404, { message: 'Set not found in set group for workout' });
			}

			await tx.delete(setsTable).where(eq(setsTable.id, setId));

			const remainingSetIds = await tx
				.select({ id: setsTable.id })
				.from(setsTable)
				.where(eq(setsTable.setGroup, setGroupId))
				.orderBy(asc(setsTable.index));

			await reindexSets(
				tx,
				setGroupId,
				remainingSetIds.map((setRow) => setRow.id)
			);
		});
	}
);

export const toggleSetComplete = form(
	z.object({
		workoutId: idField,
		setId: idField,
		reps: metricValueField,
		weight: metricValueField,
		duration: metricValueField
	}),
	async ({ workoutId, setId, reps, weight, duration }, issue) => {
		const set = await db.query.setsTable.findFirst({
			where: and(eq(setsTable.id, setId), eq(setsTable.workout, workoutId)),
			columns: {
				id: true,
				finishedAt: true,
				reps: true,
				weight: true,
				duration: true
			},
			with: {
				exercise: {
					columns: {
						measured_in: true
					}
				}
			}
		});

		if (!set) {
			error(404, { message: 'Set not found for workout' });
		}

		const parsedReps = parseOptionalPositiveInt(reps);
		if (!parsedReps.valid) {
			invalid(issue.reps('Reps must be a positive integer'));
		}

		const parsedWeight = parseOptionalPositiveFloat(weight);
		if (!parsedWeight.valid) {
			invalid(issue.weight('Weight must be a positive number'));
		}

		const parsedDuration = parseOptionalPositiveInt(duration);
		if (!parsedDuration.valid) {
			invalid(issue.duration('Duration must be a positive integer in seconds'));
		}

		let nextReps = set.reps;
		let nextWeight = set.weight;
		let nextDuration = set.duration;

		if (parsedReps.value !== null) {
			nextReps = parsedReps.value;
		}

		if (parsedWeight.value !== null) {
			nextWeight = parsedWeight.value;
		}

		if (parsedDuration.value !== null) {
			nextDuration = parsedDuration.value;
		}

		const measure = set.exercise.measured_in;
		const nextFinishedAt = set.finishedAt ? null : epochMsNow;

		if (!set.finishedAt) {
			if (measure === 'duration' && nextDuration === null) {
				invalid(issue.setId(missingMetricMessage(measure)));
			}

			if (measure === 'reps' && nextReps === null) {
				invalid(issue.setId(missingMetricMessage(measure)));
			}

			if (measure === 'reps_and_weight' && (nextReps === null || nextWeight === null)) {
				invalid(issue.setId(missingMetricMessage(measure)));
			}
		}

		if (measure === 'duration') {
			await db
				.update(setsTable)
				.set({ duration: nextDuration, reps: null, weight: null, finishedAt: nextFinishedAt })
				.where(eq(setsTable.id, setId));
			return;
		}

		if (measure === 'reps') {
			await db
				.update(setsTable)
				.set({ reps: nextReps, weight: null, duration: null, finishedAt: nextFinishedAt })
				.where(eq(setsTable.id, setId));
			return;
		}

		await db
			.update(setsTable)
			.set({ reps: nextReps, weight: nextWeight, duration: null, finishedAt: nextFinishedAt })
			.where(eq(setsTable.id, setId));
	}
);

export const toggleWorkoutComplete = form(
	z.object({
		workoutId: idField
	}),
	async ({ workoutId }) => {
		const workout = await db.query.workoutsTable.findFirst({
			where: eq(workoutsTable.id, workoutId),
			columns: { id: true, finishedAt: true }
		});

		if (!workout) {
			error(404, { message: 'Workout not found' });
		}

		await db
			.update(workoutsTable)
			.set({ finishedAt: workout.finishedAt ? null : epochMsNow })
			.where(eq(workoutsTable.id, workoutId));
	}
);

export const getWorkoutById = query(z.int(), async (workoutId) => {
	const workout = await db.query.workoutsTable.findFirst({
		where: eq(workoutsTable.id, workoutId),
		with: {
			template: true,
			setGroups: {
				with: {
					exercise: true,
					sets: true
				}
			}
		}
	});

	if (!workout) {
		return null;
	}

	workout.setGroups.sort((a, b) => a.index - b.index);
	for (const setGroup of workout.setGroups) {
		setGroup.sets.sort((a, b) => a.index - b.index);
	}

	return workout;
});

export const getCurrentWorkout = query(async () => {
	return await db.query.workoutsTable.findFirst({
		where: isNull(workoutsTable.finishedAt),
		orderBy: desc(workoutsTable.startedAt),
		with: {
			template: true
		}
	});
});
