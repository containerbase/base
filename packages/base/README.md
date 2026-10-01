# `@containerbase/base`

Metadata about the tools that [Containerbase](https://github.com/containerbase/base) supports.

The data is generated from the Containerbase sources and released with the same version as Containerbase itself.
This allows a consumer of this library to determine which tools can be used with a given version of Containerbase (via `/usr/local/containerbase/version`): if the image has the same major version and a greater or equal version than the package, every tool listed here can be installed in that image.
A new major version may remove tools, so compare against the package of the image's major version.

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

| Field        | Description                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `type`       | the installer used for the tool, one of `gem`, `npm` or `pip`                                                   |
| `parent`     | the tool it depends on, eg. `composer` depends on `php`, which requires `php` to be installed before `composer` |
| `deprecated` | the tool should not be used any more                                                                            |
| `root`       | the tool can only be installed as root, so at image build time                                                  |

Only the names `install-tool` accepts are listed.
Packages installed with an arbitrary name via `install-gem`, `install-npm` or `install-pip` are not, as that list is unbounded.

## Development

The files in `data/` and `src/data.ts` are generated, run `pnpm tools` in the repository root to update them.
