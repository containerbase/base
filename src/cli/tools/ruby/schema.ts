import { z } from 'zod';

export const RubyGemJson = z.object({
  version: z.string(),
});

export const RubyGemVersionsJson = z.array(
  z.object({
    number: z.string(),
    prerelease: z.boolean(),
  }),
);
export type RubyGemVersionsJson = z.infer<typeof RubyGemVersionsJson>;
