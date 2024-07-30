import { z } from 'zod';

export const PypiJson = z.object({
  info: z.object({
    version: z.string(),
  }),
});
