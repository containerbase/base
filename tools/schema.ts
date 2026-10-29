import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'oxfmt';
import { z } from 'zod';
import { InstalledTools } from '../src/cli/services/version.schema.ts';

// generates the json schema documenting `containerbase-cli list tools --json`
const file = fileURLToPath(
  new URL('../docs/list-tools.schema.json', import.meta.url),
);
const json = JSON.stringify(z.toJSONSchema(InstalledTools), null, 2);
// `format` doesn't discover the config file, so pass its options
const options = JSON.parse(
  await readFile(new URL('../.oxfmtrc.json', import.meta.url), 'utf8'),
);

const { code } = await format(file, json, options);

await writeFile(file, code, { encoding: 'utf8' });
