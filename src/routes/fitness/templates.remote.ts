import { form, query } from '$app/server';
import { db } from '$lib/server/db/db';
import {
	exercisesTable,
	templateSetGroupsTable,
	templateSetsTable,
	templatesTable,
	workoutsTable
} from '$lib/server/db/schema';
import { z } from 'zod';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';

const idField = z
	.string()
	.refine((value) => /^\d+$/.test(value), { message: 'Must be a positive integer' })
	.transform((value) => Number(value))
	.refine((value) => Number.isInteger(value) && value > 0, {
		message: 'Must be a positive integer'
	});

const templateNameField = z.string().trim().min(1, 'Template name is required').max(100);
const indexOffset = 1_000_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const reindexSetGroups = async (tx: Tx, templateId: number, orderedSetGroupIds: number[]) => {
	await tx
		.update(templateSetGroupsTable)
		.set({ index: sql`${templateSetGroupsTable.index} + ${indexOffset}` })
		.where(eq(templateSetGroupsTable.template, templateId));

	for (const [index, id] of orderedSetGroupIds.entries()) {
		await tx
			.update(templateSetGroupsTable)
			.set({ index })
			.where(and(eq(templateSetGroupsTable.id, id), eq(templateSetGroupsTable.template, templateId)));
	}
};

const reindexSets = async (tx: Tx, setGroupId: number, orderedSetIds: number[]) => {
	await tx
		.update(templateSetsTable)
		.set({ index: sql`${templateSetsTable.index} + ${indexOffset}` })
		.where(eq(templateSetsTable.templateSetGroup, setGroupId));

	for (const [index, id] of orderedSetIds.entries()) {
		await tx
			.update(templateSetsTable)
			.set({ index })
			.where(and(eq(templateSetsTable.id, id), eq(templateSetsTable.templateSetGroup, setGroupId)));
	}
};

export const getTemplatesPaginated = query(z.number().int().min(0), async (offset) => {
	const templates = await db
		.select({
			id: templatesTable.id,
			name: templatesTable.name
		})
		.from(templatesTable)
		.orderBy(asc(templatesTable.name))
		.limit(10)
		.offset(offset);

	return templates;
});

export const createTemplate = form(z.object({ name: templateNameField }), async ({ name }) => {
	const existingTemplate = await db.query.templatesTable.findFirst({
		where: eq(templatesTable.name, name),
		columns: { id: true }
	});

	if (existingTemplate) {
		error(409, { message: 'Template name already exists' });
	}

	const [newTemplate] = await db
		.insert(templatesTable)
		.values({ name })
		.returning({ id: templatesTable.id });

	redirect(303, `/fitness/templates/${newTemplate.id}`);
});

export const renameTemplate = form(
	z.object({
		templateId: idField,
		name: templateNameField
	}),
	async ({ templateId, name }) => {
		const template = await db.query.templatesTable.findFirst({
			where: eq(templatesTable.id, templateId),
			columns: { id: true }
		});

		if (!template) {
			error(404, { message: 'Template not found' });
		}

		const conflictingTemplate = await db.query.templatesTable.findFirst({
			where: and(eq(templatesTable.name, name), ne(templatesTable.id, templateId)),
			columns: { id: true }
		});

		if (conflictingTemplate) {
			error(409, { message: 'Template name already exists' });
		}

		await db.update(templatesTable).set({ name }).where(eq(templatesTable.id, templateId));
	}
);

export const deleteTemplate = form(z.object({ templateId: idField }), async ({ templateId }) => {
	const existingWorkout = await db.query.workoutsTable.findFirst({
		where: eq(workoutsTable.template, templateId),
		columns: { id: true }
	});

	if (existingWorkout) {
		error(409, { message: 'Cannot delete a template that has workouts' });
	}

	await db.delete(templatesTable).where(eq(templatesTable.id, templateId));
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

export const addTemplateSetGroup = form(
	z.object({
		templateId: idField,
		exerciseId: idField
	}),
	async ({ templateId, exerciseId }) => {
		await db.transaction(async (tx) => {
			const template = await tx.query.templatesTable.findFirst({
				where: eq(templatesTable.id, templateId),
				columns: { id: true }
			});

			if (!template) {
				error(404, { message: 'Template not found' });
			}

			const existingSetGroup = await tx
				.select({ index: templateSetGroupsTable.index })
				.from(templateSetGroupsTable)
				.where(eq(templateSetGroupsTable.template, templateId))
				.orderBy(desc(templateSetGroupsTable.index))
				.limit(1);

			const nextIndex =
				existingSetGroup.at(0)?.index !== undefined ? existingSetGroup[0].index + 1 : 0;

			await tx.insert(templateSetGroupsTable).values({
				template: templateId,
				exercise: exerciseId,
				index: nextIndex,
				restDuration: 150,
				isSuperset: false
			});
		});
	}
);

export const removeTemplateSetGroup = form(
	z.object({
		templateId: idField,
		setGroupId: idField
	}),
	async ({ templateId, setGroupId }) => {
		await db.transaction(async (tx) => {
			const setGroup = await tx.query.templateSetGroupsTable.findFirst({
				where: and(
					eq(templateSetGroupsTable.id, setGroupId),
					eq(templateSetGroupsTable.template, templateId)
				),
				columns: { id: true }
			});

			if (!setGroup) {
				error(404, { message: 'Set group not found for template' });
			}

			await tx.delete(templateSetGroupsTable).where(eq(templateSetGroupsTable.id, setGroupId));

			const remainingSetGroupIds = await tx
				.select({ id: templateSetGroupsTable.id })
				.from(templateSetGroupsTable)
				.where(eq(templateSetGroupsTable.template, templateId))
				.orderBy(asc(templateSetGroupsTable.index));

			await reindexSetGroups(
				tx,
				templateId,
				remainingSetGroupIds.map((setGroupRow) => setGroupRow.id)
			);
		});
	}
);

export const moveTemplateSetGroup = form(
	z.object({
		templateId: idField,
		setGroupId: idField,
		direction: z.enum(['up', 'down'])
	}),
	async ({ templateId, setGroupId, direction }) => {
		await db.transaction(async (tx) => {
			const orderedSetGroups = await tx
				.select({ id: templateSetGroupsTable.id })
				.from(templateSetGroupsTable)
				.where(eq(templateSetGroupsTable.template, templateId))
				.orderBy(asc(templateSetGroupsTable.index));

			const currentIndex = orderedSetGroups.findIndex((setGroup) => setGroup.id === setGroupId);
			if (currentIndex === -1) {
				error(404, { message: 'Set group not found for template' });
			}

			const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
			if (targetIndex < 0 || targetIndex >= orderedSetGroups.length) {
				return;
			}

			const [movedSetGroup] = orderedSetGroups.splice(currentIndex, 1);
			orderedSetGroups.splice(targetIndex, 0, movedSetGroup);

			await reindexSetGroups(
				tx,
				templateId,
				orderedSetGroups.map((setGroup) => setGroup.id)
			);
		});
	}
);

export const addSetToTemplateGroup = form(
	z.object({
		templateId: idField,
		setGroupId: idField
	}),
	async ({ templateId, setGroupId }) => {
		await db.transaction(async (tx) => {
			const setGroup = await tx.query.templateSetGroupsTable.findFirst({
				where: and(
					eq(templateSetGroupsTable.id, setGroupId),
					eq(templateSetGroupsTable.template, templateId)
				),
				columns: { id: true, exercise: true }
			});

			if (!setGroup) {
				error(404, { message: 'Set group not found for template' });
			}

			const existingSet = await tx
				.select({ index: templateSetsTable.index })
				.from(templateSetsTable)
				.where(eq(templateSetsTable.templateSetGroup, setGroupId))
				.orderBy(desc(templateSetsTable.index))
				.limit(1);

			const nextIndex = existingSet.at(0)?.index !== undefined ? existingSet[0].index + 1 : 0;

			await tx.insert(templateSetsTable).values({
				template: templateId,
				templateSetGroup: setGroupId,
				exercise: setGroup.exercise,
				index: nextIndex,
				type: 'working'
			});
		});
	}
);

export const removeSetFromTemplateGroup = form(
	z.object({
		templateId: idField,
		setGroupId: idField,
		setId: idField
	}),
	async ({ templateId, setGroupId, setId }) => {
		await db.transaction(async (tx) => {
			const setGroup = await tx.query.templateSetGroupsTable.findFirst({
				where: and(
					eq(templateSetGroupsTable.id, setGroupId),
					eq(templateSetGroupsTable.template, templateId)
				),
				columns: { id: true }
			});

			if (!setGroup) {
				error(404, { message: 'Set group not found for template' });
			}

			const set = await tx.query.templateSetsTable.findFirst({
				where: and(
					eq(templateSetsTable.id, setId),
					eq(templateSetsTable.templateSetGroup, setGroupId),
					eq(templateSetsTable.template, templateId)
				),
				columns: { id: true }
			});

			if (!set) {
				error(404, { message: 'Set not found in set group for template' });
			}

			await tx.delete(templateSetsTable).where(eq(templateSetsTable.id, setId));

			const remainingSetIds = await tx
				.select({ id: templateSetsTable.id })
				.from(templateSetsTable)
				.where(eq(templateSetsTable.templateSetGroup, setGroupId))
				.orderBy(asc(templateSetsTable.index));

			await reindexSets(
				tx,
				setGroupId,
				remainingSetIds.map((setRow) => setRow.id)
			);
		});
	}
);

export const getTemplateById = query(z.int(), async (templateId) => {
	const template = await db.query.templatesTable.findFirst({
		where: eq(templatesTable.id, templateId),
		with: {
			templateSetGroups: {
				with: {
					exercise: true,
					templateSets: true
				}
			}
		}
	});

	if (!template) {
		return null;
	}

	template.templateSetGroups.sort((a, b) => a.index - b.index);
	for (const setGroup of template.templateSetGroups) {
		setGroup.templateSets.sort((a, b) => a.index - b.index);
	}

	return template;
});
