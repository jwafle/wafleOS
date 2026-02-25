import { sql, relations } from 'drizzle-orm';
import { sqliteTable as table, check, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';
import * as t from 'drizzle-orm/sqlite-core';

export const exercisesTable = table(
	'exercises',
	{
		id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
		name: t.text().notNull(),
		measured_in: t.text({ enum: ['duration', 'reps', 'reps_and_weight'] }).notNull(),
		createdAt: t
			.int({ mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		check('measured_in_check', sql`${t.measured_in} IN ('duration', 'reps', 'reps_and_weight')`),
		uniqueIndex('exercise_name_ci_unique').on(sql`lower(trim(${t.name}))`)
	]
);

export const templatesTable = table(
	'templates',
	{
		id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
		name: t.text().notNull(),
		createdAt: t
			.int({ mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [unique('name_unique').on(t.name)]
);

export const templateSetGroupsTable = table(
	'template_set_groups',
	{
		id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
		exercise: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => exercisesTable.id),
		template: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => templatesTable.id, { onDelete: 'cascade' }),
		index: t.int({ mode: 'number' }).notNull(),
		restDuration: t.int({ mode: 'number' }).notNull().default(150),
		isSuperset: t.int({ mode: 'boolean' }).notNull().default(false)
	},
	(t) => [
		check('index_check', sql`${t.index} > -1`),
		check('rest_duration_check', sql`${t.restDuration} >= 0`),
		check('is_superset_check', sql`${t.isSuperset} IN (0,1)`),
		unique('template_index_unique').on(t.template, t.index)
	]
);

export const templateSetsTable = table(
	'template_sets',
	{
		id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
		exercise: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => exercisesTable.id),
		templateSetGroup: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => templateSetGroupsTable.id, { onDelete: 'cascade' }),
		template: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => templatesTable.id, { onDelete: 'cascade' }),
		index: t.int({ mode: 'number' }).notNull(),
		type: t
			.text({ enum: ['warmup', 'working'] })
			.notNull()
			.default('working')
	},
	(t) => [
		check('index_check', sql`${t.index} > -1`),
		check('type_check', sql`${t.type} IN ('warmup', 'working')`),
		unique('template_set_group_index_unique').on(t.templateSetGroup, t.index)
	]
);

export const workoutsTable = table('workouts', {
	id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
	template: t
		.int({ mode: 'number' })
		.notNull()
		.references(() => templatesTable.id),
	startedAt: t
		.int({ mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch())`),
	finishedAt: t.int({ mode: 'timestamp_ms' })
});

export const setGroupsTable = table(
	'set_groups',
	{
		id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
		exercise: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => exercisesTable.id),
		workout: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => workoutsTable.id, { onDelete: 'cascade' }),
		index: t.int({ mode: 'number' }).notNull(),
		restDuration: t.int({ mode: 'number' }).notNull().default(150),
		// isSuperset indicates if this set group is part of a superset with the next set group
		isSuperset: t.int({ mode: 'boolean' }).notNull().default(false)
	},
	(t) => [
		check('index_check', sql`${t.index} > -1`),
		check('rest_duration_check', sql`${t.restDuration} >= 0`),
		check('is_superset_check', sql`${t.isSuperset} IN (0,1)`),
		unique('workout_index_unique').on(t.workout, t.index)
	]
);

export const setsTable = table(
	'sets',
	{
		id: t.int({ mode: 'number' }).primaryKey({ autoIncrement: true }),
		exercise: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => exercisesTable.id),
		setGroup: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => setGroupsTable.id, { onDelete: 'cascade' }),
		workout: t
			.int({ mode: 'number' })
			.notNull()
			.references(() => workoutsTable.id, { onDelete: 'cascade' }),
		index: t.int({ mode: 'number' }).notNull(),
		type: t
			.text({ enum: ['warmup', 'working'] })
			.notNull()
			.default('working'),
		reps: t.int(),
		weight: t.real(),
		duration: t.int(),
		// finishedAt will be used to completed sets & calculate the rest timer on reload
		finishedAt: t.int({ mode: 'timestamp_ms' })
	},
	(t) => [
		check('index_check', sql`${t.index} > -1`),
		check('type_check', sql`${t.type} IN ('warmup', 'working')`),
		check('reps_check', sql`${t.reps} > 0 OR ${t.reps} IS NULL`),
		check('weight_check', sql`${t.weight} > 0 OR ${t.weight} IS NULL`),
		check('duration_check', sql`${t.duration} > 0 OR ${t.duration} IS NULL`),
		unique('set_group_index_unique').on(t.setGroup, t.index)
	]
);

export const templatesRelations = relations(templatesTable, ({ many }) => ({
	templateSetGroups: many(templateSetGroupsTable),
	workouts: many(workoutsTable)
}));

export const templateSetGroupRelations = relations(templateSetGroupsTable, ({ one, many }) => ({
	template: one(templatesTable, {
		fields: [templateSetGroupsTable.template],
		references: [templatesTable.id]
	}),
	templateSets: many(templateSetsTable),
	exercise: one(exercisesTable, {
		fields: [templateSetGroupsTable.exercise],
		references: [exercisesTable.id]
	})
}));

export const templateSetRelations = relations(templateSetsTable, ({ one }) => ({
	templateSetGroup: one(templateSetGroupsTable, {
		fields: [templateSetsTable.templateSetGroup],
		references: [templateSetGroupsTable.id]
	}),
	exercise: one(exercisesTable, {
		fields: [templateSetsTable.exercise],
		references: [exercisesTable.id]
	})
}));

export const workoutRelations = relations(workoutsTable, ({ one, many }) => ({
	template: one(templatesTable, {
		fields: [workoutsTable.template],
		references: [templatesTable.id]
	}),
	setGroups: many(setGroupsTable)
}));

export const setGroupRelations = relations(setGroupsTable, ({ one, many }) => ({
	workout: one(workoutsTable, {
		fields: [setGroupsTable.workout],
		references: [workoutsTable.id]
	}),
	sets: many(setsTable),
	exercise: one(exercisesTable, {
		fields: [setGroupsTable.exercise],
		references: [exercisesTable.id]
	})
}));

export const setRelations = relations(setsTable, ({ one }) => ({
	setGroup: one(setGroupsTable, {
		fields: [setsTable.setGroup],
		references: [setGroupsTable.id]
	}),
	exercise: one(exercisesTable, {
		fields: [setsTable.exercise],
		references: [exercisesTable.id]
	})
}));

export const exerciseRelations = relations(exercisesTable, ({ many }) => ({
	templateSetGroups: many(templateSetGroupsTable),
	templateSets: many(templateSetsTable),
	setGroups: many(setGroupsTable),
	sets: many(setsTable)
}));
