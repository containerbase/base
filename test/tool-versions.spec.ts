import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  FormatIndex,
  ToolIndex,
  ToolVersions,
  VersionFiles,
  VersionIntegrity,
} from '../packages/base/src/tool-versions-schema.ts';

/** The data embedded into the image, downloaded by `pnpm tool-versions`. */
const root = fileURLToPath(
  new URL(
    '../dist/docker/usr/local/containerbase/tool-versions/',
    import.meta.url,
  ),
);

/** Files of the archive which have no schema of the reader format. */
const unchecked = /(^|\/)[^/]*\.schema\.json$|^index\.json$/;

/** The schemas of the files of the `v1/` folder, by their path. */
const v1Schemas: [RegExp, z.ZodType][] = [
  [/^v1\/index\.json$/, ToolIndex],
  [/^v1\/[^/]+\.integrity\.json$/, VersionIntegrity],
  [/^v1\/[^/]+\.json$/, ToolVersions],
  [/^v1\/[^/]+\/[^/]+\.json$/, VersionFiles],
];

/** Every file of the `v1/` folder identifies its format by a `/v1/` url. */
const V1SchemaUrl = z.object({
  $schema: z.string().regex(/^https:\/\/.+\/v1\/[^/]+\.schema\.json$/),
});

/**
 * Reads and parses a json file of the embedded data.
 * @param file - path relative to the root of the data
 */
async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, file), 'utf8'));
}

/**
 * The SRI-style sha256 integrity of a file of the embedded data.
 * @param file - path relative to the root of the data
 */
async function integrityOf(file: string): Promise<string> {
  const data = await readFile(join(root, file));
  return `sha256-${createHash('sha256').update(data).digest('base64')}`;
}

describe('tool-versions', () => {
  let files: string[];

  beforeAll(async () => {
    try {
      files = (await readdir(root, { recursive: true })).filter((file) =>
        file.endsWith('.json'),
      );
    } catch {
      throw new Error(
        `The tool-versions data is missing in ${root}, run \`pnpm tool-versions\` or \`pnpm build\` first.`,
      );
    }
  });

  test('the root index is valid and lists v1', async () => {
    const index = FormatIndex.parse(await readJson('index.json'));

    expect(index.formats.map((format) => format.path)).toContain('v1/');
  });

  test('every file of v1 matches its schema', async () => {
    const failures: string[] = [];
    for (const file of files.filter((file) => file.startsWith('v1/'))) {
      if (unchecked.test(file)) {
        continue;
      }
      const schema = v1Schemas.find(([pattern]) => pattern.test(file))?.[1];
      if (!schema) {
        failures.push(`${file}: no schema for this file`);
        continue;
      }
      const data = await readJson(file);
      for (const result of [
        schema.safeParse(data),
        V1SchemaUrl.safeParse(data),
      ]) {
        if (!result.success) {
          failures.push(`${file}: ${result.error.message}`);
        }
      }
    }

    expect(failures).toEqual([]);
    // reads and parses about a thousand files, slow on a busy machine
  }, 60_000);

  test('the integrity chain is intact', async () => {
    const failures: string[] = [];
    const index = ToolIndex.parse(await readJson('v1/index.json'));
    const referenced = new Set<string>();

    for (const entry of index.tools) {
      const references = [entry.slim, entry.versionFiles].filter(
        (reference) => reference !== undefined,
      );
      for (const { file, integrity } of references) {
        referenced.add(`v1/${file}`);
        if ((await integrityOf(`v1/${file}`)) !== integrity) {
          failures.push(`v1/${file}: integrity of the index differs`);
        }
      }

      const slim = ToolVersions.parse(await readJson(`v1/${entry.slim.file}`));
      if (slim.tool !== entry.tool) {
        failures.push(`v1/${entry.slim.file}: tool is not ${entry.tool}`);
      }
      if (slim.versions.length !== entry.versionCount) {
        failures.push(
          `v1/${entry.slim.file}: ${slim.versions.length} versions, not ${entry.versionCount}`,
        );
      }

      if (entry.versionFiles) {
        const { tool, versions } = VersionIntegrity.parse(
          await readJson(`v1/${entry.versionFiles.file}`),
        );
        if (tool !== entry.tool) {
          failures.push(
            `v1/${entry.versionFiles.file}: tool is not ${entry.tool}`,
          );
        }
        for (const [version, integrity] of Object.entries(versions)) {
          const file = `v1/${entry.tool}/${version}.json`;
          referenced.add(file);
          if ((await integrityOf(file)) !== integrity) {
            failures.push(`${file}: integrity of the tool differs`);
          }
          const files = VersionFiles.parse(await readJson(file));
          if (files.tool !== entry.tool || files.version !== version) {
            failures.push(`${file}: is for ${files.tool} ${files.version}`);
          }
        }
      }
    }

    // nothing is published without being part of the chain
    const unreferenced = files.filter(
      (file) =>
        file.startsWith('v1/') &&
        !unchecked.test(file) &&
        !referenced.has(file) &&
        file !== 'v1/index.json',
    );

    expect(failures).toEqual([]);
    expect(unreferenced).toEqual([]);
  }, 60_000);
});
