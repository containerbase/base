# `@containerbase/base`

Metadata about the tools [containerbase](https://github.com/containerbase/base) supports.

The data is generated from the containerbase sources and released with the same version as containerbase itself.
A consumer can therefore compare this package's version with the version an image reports in `/usr/local/containerbase/version`: if the image version is greater than or equal to the package version, every tool listed here can be installed in that image.

## Usage

```ts
import { toolNames, tools, type ToolName } from '@containerbase/base';

tools.composer; // { parent: 'php' }
tools.kas; // { type: 'pip', parent: 'python' }

function install(tool: ToolName): void {
  // `ToolName` is a union of all supported names
}
```

The raw data and its json schema are also exported, for consumers which don't use TypeScript:

```ts
import tools from '@containerbase/base/tools.json' with { type: 'json' };
```

The zod schemas live behind a separate entry point, so the default export stays dependency free:

```ts
import { SupportedTools, ToolName } from '@containerbase/base/zod';
```

## Contents

Each entry may carry the following metadata:

| Field        | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `type`       | the installer used for the tool, one of `gem`, `npm` or `pip` |
| `parent`     | the tool it depends on, eg. `composer` depends on `php`       |
| `deprecated` | the tool should not be used any more                          |

Only the names `install-tool` accepts are listed.
Packages installed with an arbitrary name via `install-gem`, `install-npm` or `install-pip` are not, as that list is unbounded, and neither are the v1 shell tools, which need root privileges and can't be installed on the fly.

## Development

The files in `data/` and `src/data.ts` are generated, run `pnpm tools` in the repository root to update them.
