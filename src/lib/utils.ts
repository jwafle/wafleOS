import { z } from 'zod';

export const idSchema = z.coerce
	.number({ error: 'ID must be a number' })
	.int({ error: 'ID must be an integer' })
	.positive({ error: 'ID must be positive' })
	.min(1, { error: 'ID must be 1 or greater' });
