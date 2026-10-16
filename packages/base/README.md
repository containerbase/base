# `@containerbase/base`

Metadata about the tools that [Containerbase](https://github.com/containerbase/base) supports.

The data is generated from the Containerbase sources and released with the same version as Containerbase itself.
This allows a consumer of this library to determine which tools can be used with a given version of Containerbase (via `/usr/local/containerbase/version`): if the image has the same major version as this package and a version greater than or equal to the package version, every tool listed here can be installed in that image.
A new major version may remove tools, so compare against the package of the image's major version.

The package version to compare with is exported too:

```ts
import pkg from '@containerbase/base/package.json' with { type: 'json' };

pkg.version; // eg. '14.2.0'
```

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

The Ubuntu release the default Containerbase image is built from is exported as `defaultDistro`, it is the distro `minVersion` refers to:

```ts
import { defaultDistro } from '@containerbase/base';

defaultDistro; // 'noble'
```

The format of the published [tool-versions](https://github.com/containerbase/tool-versions/blob/main/docs/format.md) data is exported too, so its readers share one definition.
The zod schemas (`ToolVersions`, `VersionFiles`, `VersionIntegrity`, `ToolIndex`, `FormatIndex` and their parts) live behind the `zod` entry point, the zod free types behind the main one:

```ts
import { ToolVersions } from '@containerbase/base/zod';
import type { ToolVersions as ToolVersionsType } from '@containerbase/base';
```

The schemas ignore unknown keys and accept any arch name, so additive changes of the format don't break a reader; readers ignore files of an arch they don't know.

## Contents

Each entry may carry the following metadata:

| Field              | Description                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`             | the package manager installing the tool, one of `gem`, `npm`, `pip` or `dotnet`                                                                                                       |
| `parent`           | the tool it depends on, eg. `composer` depends on `php`, which requires `php` to be installed before `composer`                                                                       |
| `deprecated`       | the tool should not be used any more                                                                                                                                                  |
| `root`             | the tool can only be installed as root, so at image build time                                                                                                                        |
| `minVersion`       | the oldest version containerbase supports for the tool on the default distro, in the tool's versioning; tools without a known limit have none                                         |
| `distroMinVersion` | the oldest version supported on an Ubuntu release (`jammy`, `noble` or `resolute`), only for releases whose floor differs from `minVersion`, which is the floor on the default distro |

Only the names `install-tool` accepts are listed.
Packages installed with an arbitrary name via `install-gem`, `install-npm` or `install-pip` are not, as that list is unbounded.

## Development

The files in `data/` and `src/data.ts` are generated, run `pnpm tools` in the repository root to update them.
