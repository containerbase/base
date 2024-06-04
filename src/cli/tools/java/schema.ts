import { z } from 'zod';

const JavaRelease = z.object({
  filename: z.string(),
  sha512: z.string(),
  url: z.string(),
  version: z.string(),
});
export type JavaRelease = z.infer<typeof JavaRelease>;

export const JavaReleases = z.array(JavaRelease);
export type JavaReleases = z.infer<typeof JavaReleases>;
