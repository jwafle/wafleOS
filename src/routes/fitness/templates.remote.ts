import { query } from '$app/server';
import { db } from '$lib/server/db/db';
import { templatesTable } from '$lib/server/db/schema';
import { z } from 'zod';
import { asc } from 'drizzle-orm';

export const getTemplatesPaginated = query(z.number(), async (offset) => {
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
