import { z } from 'zod';
import { logger } from '../../utils';

// function fixPythonVersion(version: string): string {
//   return version; //.replace('\u003C', '<').replace('\u003E', '>');
// }

const depRe = /^(?<name>[a-z-]+)(?<extra>\[[a-z,]+\])?(?<version>.+)(?:$|;)/;

function parseDep(dep: string): [string, string] | null {
  const groups = depRe.exec(dep)?.groups;
  if (!groups) {
    logger.debug({ dep }, 'Failed to parse dependency');
    return null;
  }
  return [groups.name!, groups.version!];
}

const PypiRelease = z.object({
  packagetype: z.enum(['sdist', 'bdist_wheel', 'unknown']).catch('unknown'),
  requires_python: z.string().nullish(),
  yanked: z.boolean(),
});

export const PypiJson = z.object({
  info: z.object({
    version: z.string(),
    requires_python: z.string().nullish(),
    requires_dist: z
      .array(z.string().transform(parseDep))
      .transform((v) => Object.fromEntries(v.filter((d) => !!d)))
      .nullish(),
  }),
  releases: z.record(z.array(PypiRelease).transform((v) => v[0])),
});

export type PypiJson = z.infer<typeof PypiJson>;
