import { z } from 'zod';

// https://api.adoptium.net/q/swagger-ui

const AdoptiumVersionData = z.object({
  semver: z.string(),
});

export const AdoptiumReleaseVersions = z.object({
  versions: z.array(AdoptiumVersionData),
});

const AdoptiumPackage = z.object({
  /**
   * sha256 checksum
   */
  checksum: z.string(),
  link: z.string(),
  name: z.string(),
});

export type AdoptiumPackage = z.infer<typeof AdoptiumPackage>;

const AdoptiumBinary = z.object({
  package: AdoptiumPackage,
});

const AdoptiumRelease = z.object({
  binaries: z.array(AdoptiumBinary),
});

export const AdoptiumReleases = z.array(AdoptiumRelease);
