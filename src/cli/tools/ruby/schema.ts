import { z } from 'zod';

export const RubyGemJson = z.object({
  version: z.string(),
});
