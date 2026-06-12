import { isTruthy } from '@sindresorhus/is';
import { z } from 'zod';
import { HttpChecksumTypes } from '../../services/http.service.ts';

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

export const GradleVersionData = z.object({
  version: z.string(),
});

const AndroidSdkChannel = z
  .object({
    '@': z.object({ id: z.string() }),
    '#text': z.enum(['stable', 'beta', 'dev', 'canary']),
  })
  .transform(({ '#text': value, '@': { id } }) => ({ id, value }))
  .nullable()
  .catch(null);

const AdroidSdkArchive = z
  .object({
    complete: z.object({
      checksum: z.object({
        '@': z.object({
          type: z.enum(HttpChecksumTypes),
        }),
        '#text': z.string(),
      }),
      url: z.string(),
    }),
    'host-os': z.enum(['macosx', 'linux', 'windows']).optional(),
  })
  .transform(
    ({
      complete: {
        checksum: {
          '#text': checksum,
          '@': { type: checksumType },
        },
        url,
      },
      'host-os': os,
    }) => ({
      checksum,
      checksumType,
      url,
      os,
    }),
  )
  .nullish()
  .catch(null);

const AdroidSdkRemotePackage = z
  .object({
    '@': z.object({ path: z.string(), obsolete: z.boolean().optional() }),
    channelRef: z
      .object({ '@': z.object({ ref: z.string() }) })
      .transform((v) => v['@'].ref),
    revision: z
      .object({
        major: z.number(),
        minor: z.number().optional(),
        micro: z.number().optional(),
        preview: z.number().optional().catch(undefined),
      })
      .transform((v) =>
        [v.major, v.minor, v.micro, v.preview].filter(isTruthy).join('.'),
      ),
    archives: z
      .object({
        archive: z.array(AdroidSdkArchive).transform((v) => v.filter(isTruthy)),
      })
      .transform(({ archive }) => archive),
  })
  .transform(
    ({
      '@': { path, obsolete },
      channelRef: channel,
      archives,
      revision: version,
    }) => ({
      path,
      archives,
      channel,
      version,
      obsolete,
    }),
  );

export const AndroidSdkRepo = z
  .object({
    'sdk-repository': z.object({
      channel: z
        .array(AndroidSdkChannel)
        .transform((v) =>
          Object.fromEntries(v.filter(isTruthy).map((v) => [v.id, v.value])),
        ),
      remotePackage: z.array(AdroidSdkRemotePackage),
    }),
  })
  .transform(({ 'sdk-repository': { channel: channels, remotePackage } }) => ({
    packages: remotePackage.map(({ channel, ...pkg }) => ({
      ...pkg,
      channel: channels[channel],
    })),
  }));
export type AndroidSdkRepo = z.infer<typeof AndroidSdkRepo>;
