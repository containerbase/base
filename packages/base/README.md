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

The zod schemas live behind a separate entry point, so the default export only depends on `semver`:

```ts
import { SupportedTools, ToolName } from '@containerbase/base/zod';
```

The Ubuntu release the default Containerbase image is built from is exported as `defaultDistro`, it is the distro `minVersion` refers to:

```ts
import { defaultDistro } from '@containerbase/base';

defaultDistro; // 'noble'
```

The format of the published [tool-versions](https://github.com/containerbase/tool-versions/blob/main/docs/format.md) data is exported too, so its readers share one definition.
The zod schemas (`ToolVersions`, `VersionFiles`, `VersionIntegrity`, `ToolIndex`, `FormatIndex`, `ReleaseInfo` and their parts) live behind the `zod` entry point, the zod free types behind the main one:

```ts
import { ToolVersions } from '@containerbase/base/zod';
import type { ToolVersions as ToolVersionsType } from '@containerbase/base';
```

The format version the schemas describe is exported by both entry points, so a reader doesn't hardcode it:

```ts
import {
  isToolVersionsFormat,
  toolVersionsFormat,
  toolVersionsFormatPath,
} from '@containerbase/base';

toolVersionsFormat; // 1
toolVersionsFormatPath; // 'v1', the folder of the format relative to the site root
isToolVersionsFormat(
  'https://containerbase.github.io/tool-versions/v1/tool.schema.json',
); // true
isToolVersionsFormat(
  'https://containerbase.github.io/tool-versions/v2/tool.schema.json',
); // false
```

The containerbase image embeds the tool-versions data, a reader running in the image can use it when the site can't be reached:

```ts
import {
  isContainerbase,
  toolVersionsFormatPath,
  toolVersionsPath,
} from '@containerbase/base';

if (isContainerbase()) {
  // eg. '/usr/local/containerbase/tool-versions/v1/node.json'
  const file = `${toolVersionsPath}/${toolVersionsFormatPath}/node.json`;
}
```

`isContainerbase()` checks the `CONTAINERBASE` variable the image sets, pass another environment to check that one instead of `process.env`.

`validateContainerbaseVersion()` reads the version of the image from `/usr/local/containerbase/version` (`containerbaseVersionFile`) and throws when the image doesn't support everything this package describes: it needs the same major version as this package and the same or a newer minor or patch version.
Development images, whose version is a git sha or `0.0.0-…`, aren't checked; a missing or empty version file throws.
Call it on startup when `isContainerbase()` is true; `isCompatibleVersion(imageVersion)` does the comparison without reading the file, and `packageVersion` is the version it compares with:

```ts
import {
  isContainerbase,
  validateContainerbaseVersion,
} from '@containerbase/base';

if (isContainerbase()) {
  await validateContainerbaseVersion(); // eg. '14.2.0', or throws
}
```

Containerbase replaces the urls it downloads from with the `CONTAINERBASE_CDN` and `URL_REPLACE_<n>_FROM` / `URL_REPLACE_<n>_TO` variables, see [custom registries](https://github.com/containerbase/base/blob/main/docs/custom-registries.md).
A reader can replace its urls the same way, so a mirror configured for containerbase works for it too:

```ts
import { getUrlReplacements, replaceUrl } from '@containerbase/base';

const { replacements, invalid } = getUrlReplacements(); // reads `process.env`
// `invalid` lists the `URL_REPLACE_<n>_FROM` variables without a value or `_TO` counterpart
replaceUrl(
  'https://containerbase.github.io/tool-versions/v1/node.json',
  replacements,
  process.env.CONTAINERBASE_CDN,
);
```

A tool's data may list `minCb` ranges, the oldest containerbase version which can install a version and every version above it.
`filterByMinCb(data, cbVersion)` returns the `versions` the given containerbase version can install, in the order of the data, and the `cb` values of the unmet ranges as `needed`.
A `cbVersion` which isn't a release, like `0.0.0-PLACEHOLDER` (see `isReleaseVersion(version)`), skips the filter:

```ts
import { filterByMinCb, packageVersion } from '@containerbase/base';
import type { ToolVersions } from '@containerbase/base';

declare const data: ToolVersions; // the content of eg. `node.json`

const { versions, needed } = filterByMinCb(data, packageVersion);
```

`minCbByVersion(data)` returns the containerbase version each covered tool version needs as a `Map` by version, the newest `cb` of the ranges covering it.
A `cb` which isn't valid semver wins over valid ones, as it is never met.
Versions no range covers aren't listed:

```ts
import { minCbByVersion } from '@containerbase/base';

const needs = minCbByVersion(data); // eg. `needs.get('2.0.0')` is `'14.51.0'`
```

The schemas ignore unknown keys and accept any arch name, so additive changes of the format don't break a reader; readers ignore files of an arch they don't know.

The package logs nothing by default.
`configure({ logger })` sets the logger its functions log to, eg. a pino or Renovate logger, and `configure()` turns logging off again:

```ts
import { configure } from '@containerbase/base';
import { logger } from './logger.ts';

configure({ logger });
```

`getLogger()` returns the configured logger, so a package building on `@containerbase/base` can log to the same one.
`isConfigured()` tells whether a logger was set, so that package can configure a fallback when nobody did:

```ts
import { configure, getLogger, isConfigured } from '@containerbase/base';
import { fallbackLogger } from './logger.ts';

if (!isConfigured()) {
  configure({ logger: fallbackLogger });
}

getLogger().debug({ tool: 'node' }, 'resolving');
```

## Contents

Each entry may carry the following metadata:

| Field              | Description                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`             | the package manager installing the tool, one of `gem`, `npm`, `pip` or `dotnet`                                                                                              |
| `parent`           | the tool it depends on, eg. `composer` depends on `php`, which requires `php` to be installed before `composer`                                                              |
| `deprecated`       | the tool should not be used any more                                                                                                                                         |
| `root`             | the tool can only be installed as root, so at image build time                                                                                                               |
| `minVersion`       | the oldest version containerbase supports for the tool on the default distro, in the tool's versioning; tools without a known limit have none                                |
| `distroMinVersion` | the oldest version supported on an Ubuntu release (`noble` or `resolute`), only for releases whose floor differs from `minVersion`, which is the floor on the default distro |

Only the names `install-tool` accepts are listed.
Packages installed with an arbitrary name via `install-gem`, `install-npm` or `install-pip` are not, as that list is unbounded.

## Development

The files in `data/` and `src/data.ts` are generated, run `pnpm tools` in the repository root to update them.
