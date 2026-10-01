import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import { InstalledTools } from '../src/cli/services/version.schema.ts';

// generates the json schema documenting `containerbase-cli list tools --json`
const file = fileURLToPath(
  new URL('../docs/list-tools.schema.json', import.meta.url),
);
const json = JSON.stringify(z.toJSONSchema(InstalledTools), null, 2);
const options = await resolveConfig(file);

await writeFile(file, await format(json, { ...options, filepath: file }), {
  encoding: 'utf8',
});
