import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { idSchema } from '$lib/utils';
import { z } from 'zod';

export const load: PageLoad = ({ params }) => {
	const result = idSchema.safeParse(params.id);
	if (!result.success) {
		console.error(z.treeifyError(result.error));

		error(404, {
			message: 'ID must be a positive integer greater than 1'
		});
	}

	return {
		workoutId: result.data
	};
};
