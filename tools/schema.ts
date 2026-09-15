import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { InstalledTools } from '../src/cli/services/version.schema.ts';

// generates the json schema documenting `containerbase-cli list tools --json`
await writeFile(
  new URL('../docs/list-tools.schema.json', import.meta.url),
  `${JSON.stringify(z.toJSONSchema(InstalledTools), null, 2)}\n`,
  { encoding: 'utf8' },
);
