# Adding a new tool

## How tools work

Tools can be installed at image build time, or during the runtime of a given image, using `install-tool <name> [version]`, which is shorthand for `containerbase-cli install tool`.

See [tools.md](./tools.md) for the full command reference.

`InstallToolService` ([`src/cli/install-tool/install-tool.service.ts`](../src/cli/install-tool/install-tool.service.ts)) runs the following lifecycle:

1. **resolve the version** - an explicit argument, the `<TOOL>_VERSION` environment variable, or a `ToolVersionResolver` if the tool has one
1. **prepare** - one-time setup of directories, users and files, unless the tool is one of the `NoPrepareTools`
1. **initialize** - unless the tool is one of the `NoInitTools`
1. **validate** - the version string must be acceptable to the install service
1. **install** - download, verify the checksum, and extract into a versioned tool path
1. **link** - put a shell wrapper on `PATH`
1. **test** - run something like `<tool> --version` to prove the install worked

Every tool is an `@injectable()` class extending `BaseInstallService` ([`src/cli/install-tool/base-install.service.ts`](../src/cli/install-tool/base-install.service.ts)), living under [`src/cli/tools/`](../src/cli/tools/) and registered in [`src/cli/install-tool/index.ts`](../src/cli/install-tool/index.ts).

Everything is Linux-only and must work on both `amd64` and `arm64`.

## Which kind of tool are you adding?

| Kind                                              | Work required                                                | Who                        | Examples                                                  |
| ------------------------------------------------- | ------------------------------------------------------------ | -------------------------- | --------------------------------------------------------- |
| A `pip`, `npm` or `gem` package                   | One map entry plus tests                                     | Contributor                | [`kas`](https://github.com/containerbase/base/pull/6525)  |
| Upstream ships a prebuilt Linux binary or archive | A tool-versions entry, then a new install service plus tests | Contributor                | [`aube`](https://github.com/containerbase/base/pull/7162) |
| The tool has to be compiled from source           | A new `containerbase/*-prebuild` repository                  | Maintainer (**ask first**) | `php`, `python`, `ruby`, `node`                           |

> [!IMPORTANT]
> We prefer that you raise [a "new tool" Issue](https://github.com/containerbase/base/issues/new?template=new-tool.yml) rather than directly raising a Pull Request.
>
> Due to some of the complexities of Containerbase, as well as our guided Issue checklist, this can help make sure that relevant information is taken into account.

Depending on whether there are usable Linux release artifacts, which work on the versions of Ubuntu we target, or if it requires we build from source, this may or may not be a straightforward addition.

### Kind 1: a `pip`, `npm` or `gem` package

If the tool is installable from PyPI, the npm registry or RubyGems, we will prefer that.

Adding a tool of this type is straightforward, and does not require any additional custom handling.

Files to change:

1. [`src/cli/tools/index.ts`](../src/cli/tools/index.ts) - add the tool to `ResolverMap` with its type, so `install-tool <name>` is mapped to `install-pip` / `install-npm` / `install-gem`:

   ```ts
   export const ResolverMap: Record<string, InstallToolType | undefined> = {
     // ...
     kas: 'pip',
   };
   ```

1. [`docs/custom-registries.md`](./custom-registries.md) - add the tool to the "Known tools" list under the `pip` / `npm` / `gem` section.
1. Tests - add an `install-tool` line to the relevant language test images, for example [`test/python/Dockerfile`](../test/python/Dockerfile), [`test/python/Dockerfile.arm64`](../test/python/Dockerfile.arm64) and [`test/Dockerfile.distro`](../test/Dockerfile.distro).
   Every pinned version needs a Renovate comment above it so the test version stays current:

   ```dockerfile
   # renovate: datasource=pypi
   RUN install-tool kas 5.2
   ```

1. [`.github/renovate.json`](../.github/renovate.json) - add the tool name to **both** `matchDepNames` lists (the "Don't separate minor and patch updates in tests" rule and the "Automerge test selected minor updates in tests" rule).
1. [`packages/base`](../packages/base/) - run `pnpm tools` and commit the regenerated files, so the new tool shows up in the published tool list.
   `pnpm lint:tools` and `pnpm lint:schema` compare against the git index, so they fail until the regenerated files are staged.

Note the arm64 test files use one image stage per tool, terminating in a `COPY --from=test-<tool> /.dummy /.dummy` line in the final stage - add both halves.

### Kind 2: an upstream prebuilt binary

Before starting, check that upstream meets these requirements:

- self-contained Linux binaries or archives for **both** `amd64` and `arm64`
- a stable, predictable download URL that contains the version
- **published checksums** - Containerbase verifies every download against the checksum of the [tool-versions](https://github.com/containerbase/tool-versions) data, which reads them from upstream. If a tool doesn't have upstream checksums published, this will block proceeding with adding the tool to Containerbase, so it's worth raising that upstream first.
- a license that allows us to redistribute the binaries inside our images. The Issue template asks for the SPDX identifier of the tool _and_ of any prebuilt binaries, so it's worth checking early rather than discovering a blocker after the code is written.

#### The tool-versions data first

A new tool downloads its files only from the [tool-versions](https://github.com/containerbase/tool-versions) data, so the install service has no upstream download, checksum or version lookup of its own.
The data has to list the tool before the install service can be tested, in this order:

1. Open the containerbase pull request, as a draft until the data has the tool.
1. In tool-versions, add the tool to [`src/tools.ts`](https://github.com/containerbase/tool-versions/blob/main/src/tools.ts): its source, metadata and file names, like `aube`.
   `@containerbase/base` doesn't know the tool yet, so add a `toolExceptions` entry naming the containerbase pull request.
   Versions from GitHub releases need no new datasource, even when the files are hosted elsewhere: a file function builds their urls and checksum urls, like `kubectl` and `helm`.
   Only versions listed somewhere else, which no datasource there reads yet, need a new one, see its [`docs/sources.md`](https://github.com/containerbase/tool-versions/blob/main/docs/sources.md).
1. Write the install service as below. Its spec mocks the data, so it doesn't wait for the release.
1. Once tool-versions has released it, update the `tool-versions` dependency in the containerbase pull request, or wait for Renovate's update, so the embedded data has the tool.
   The container tests need that data, there is no way to use unreleased data.
1. After the containerbase release, the `@containerbase/base` update in tool-versions removes the `toolExceptions` entry.

#### The install service

Create `src/cli/tools/<tool>.ts` (or a subdirectory if the tool belongs to an existing language family, e.g. `src/cli/tools/java/`).

For instance, [`src/cli/tools/aube.ts`](../src/cli/tools/aube.ts) is a good template:

```ts
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class AubeInstallService extends BaseInstallService {
  readonly name = 'aube';

  /** The tool-versions data starts at 1.0.0, earlier ones are prereleases. */
  override readonly minVersion = '1.0.0';

  /** The arch name of the release assets for the host. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the glibc build from the tool-versions data, verified against
   * its checksum, and extracts it into the versioned `bin` folder.
   * @throws when the data has no file for the version on this host
   */
  override async install(version: string): Promise<void> {
    const filename = `aube-v${version}-${this.ghArch}-unknown-linux-gnu.tar.gz`;

    const file = await this.downloadNamedToolFile(version, filename);
    if (!file) {
      throw new Error(
        `There is no tool-versions file for aube ${version} on this host`,
      );
    }

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({ file, cwd: path });
  }

  /** Links the `aube` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `aube --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
```

Things worth knowing:

- Pick the file with `this.downloadNamedToolFile(version, name)` when the data lists several per arch, like aube's gnu and musl builds, else with `this.downloadToolFile(version)`.
  Both return `undefined` without a data file for the host: throw then, don't fall back to an upstream download.
- Set `minVersion` to the oldest release the install service supports, like the first stable release with Linux files for both architectures and a checksum.
  `pnpm tools` publishes it in [`packages/base`](../packages/base/), and tool-versions leaves out older releases.
- Follow the [tool installer best practices](./tool-installer-best-practices.md) for checksums, folders and shared helpers.
- Always download through `this.http.download` rather than fetching yourself - it applies the [url replacements](./custom-registries.md) and the [CDN](./cdn.md) resolution.
- `checksumType` accepts `sha1`, `sha224`, `sha256`, `sha384` and `sha512`.
  If upstream ships a checksum per artifact, see [`src/cli/tools/apm.ts`](../src/cli/tools/apm.ts).
- If the tool is a single binary rather than an archive, copy and `chmod` it instead of extracting - see [`src/cli/tools/sops.ts`](../src/cli/tools/sops.ts).
- Set `readonly parent = 'node'` (or `python`, `php`, ...) if the tool needs another tool installed first.
- Override `validate(version)` if the tool uses versioning that the default `isValid` check rejects. This is where the "supported version range" from the Issue gets enforced, so if we've agreed to support only some majors, encode that here.
- `test()` is where the "key commands that must work" from the Issue become an automated check. Where it's cheap to do so, prefer running a command the tool is actually needed for over a bare `--version`.

#### Uninstalling

`uninstall-tool <tool> <version>` calls `BaseInstallService.uninstall()`, which by default removes the versioned tool path.
Containerbase then removes the shell wrappers, the current-version marker and the version database entries for you.

That default is only correct if `install()` writes **everything** below `createVersionedToolPath()`.
If your tool writes anywhere else - `$HOME`, a shared cache, or system packages - either override `uninstall()` to clean that up, or raise it on the Issue so we can agree what should happen.

If the tool keeps a download cache in the containerbase cache, eg. a folder its prepare service links from `$HOME`, declare it in `cacheDirs`, so `containerbase-cli cleanup cache` removes it, see the [tool installer best practices](./tool-installer-best-practices.md#folders-ownership-and-links).

Two more things worth knowing:

- If you attempt to uninstall a tool that other installed tools depend on (by declaring it as a `parent`), Containerbase will refuse to uninstall until `--recursive` is passed
- Legacy shell tools cannot be uninstalled at all - `uninstall-tool` returns `NotSupported` for them

#### Optional: a version resolver

A tool without a resolver resolves a missing, `latest` or partial version from the tool-versions data, so a new tool needs none.
Existing tools have one if `install-tool <tool>` with no version should install the latest release without the data.

For example, see `MiseVersionResolver` in [`src/cli/tools/mise.ts`](../src/cli/tools/mise.ts):

```ts
@injectable()
@injectFromHierarchy()
export class MiseVersionResolver extends ToolVersionResolver {
  readonly tool = 'mise';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return (await this.http.get('https://mise.jdx.dev/VERSION')).trim();
    }
    return version;
  }
}
```

Resolvers are bound with `container.bind(TOOL_VERSION_RESOLVER).to(...)` in the same file as the install services.

#### Wiring it up

1. [`src/cli/install-tool/index.ts`](../src/cli/install-tool/index.ts) - import the class and bind it:

   ```ts
   container.bind(INSTALL_TOOL_TOKEN).to(BufInstallService);
   ```

   Both the import list and the bind list are alphabetical.

1. [`src/cli/tools/index.ts`](../src/cli/tools/index.ts) - add the tool name to `NoPrepareTools`, unless it genuinely needs a prepare step.
   `NoInitTools` extends `NoPrepareTools`, so one entry covers both.

1. [`docs/custom-registries.md`](./custom-registries.md) - add a section documenting every URL the tool downloads from, with samples.
   This is what lets users behind a proxy configure their replacements, for both architectures.
   Follow the shape of the [`aube`](./custom-registries.md#aube) section - a `## <tool>` heading, "downloaded from the urls of the [tool versions data](./custom-registries.md#tool-versions-data-containerbasegithubio), which point to:" with the release URLs, then a `txt` block of sample download URLs.

1. Tests - a tool which only needs install checks goes into `test/latest`, like other simple tools; one which needs bigger tests, like projects or several versions, gets its own `test/<tool>` directory with a `Dockerfile` and a `Dockerfile.arm64` instead. For `test/latest`, add the tool to:
   - [`test/latest/Dockerfile`](../test/latest/Dockerfile), in one of the grouped stages (and update that stage's `# test: ...` comment)
   - [`test/latest/Dockerfile.arm64`](../test/latest/Dockerfile.arm64), as its own `FROM base AS test-<tool>` stage plus a `COPY --from=test-<tool> /.dummy /.dummy` line in the final stage
   - [`test/Dockerfile.distro`](../test/Dockerfile.distro) if the tool should be verified across Ubuntu releases

   Each pinned version needs a Renovate comment.
   `install-tool` strips a leading `v`, so the version can be the tag of the release:

   ```dockerfile
   # renovate: datasource=github-releases packageName=bufbuild/buf
   RUN install-tool buf v1.72.0
   ```

   Other tag prefixes, like `kustomize/v`, are set in the tool's entry in tool-versions, and the tests pin the plain version, like `install-tool kustomize 5.8.3`.

1. [`.github/renovate.json`](../.github/renovate.json) - add the tool name to both `matchDepNames` lists.
1. [`packages/base`](../packages/base/) - run `pnpm tools` and commit the regenerated files, so the new tool shows up in the published tool list.
   `pnpm lint:tools` and `pnpm lint:schema` compare against the git index, so they fail until the regenerated files are staged.

> [!NOTE]
> You'll notice that we lean on integration tests with Docker instead of unit tests.

#### Prepare services, and tools needing a development stack

Our Issue template asks whether you need the runtime only (a CLI or binary), or a full development stack (headers, SDK, compiler).
Everything above assumes the former.

A tool that needs system packages - a compiler, headers, `make` - installs them from a prepare service via `AptService`, not from `install()`.

[`ConanPrepareService`](../src/cli/tools/python/conan.ts) is the smallest example:

```ts
override async prepare(): Promise<void> {
  await this.aptSvc.install('cmake', 'gcc', 'g++', 'make', 'perl');
  // ...
}
```

Add a `<Tool>PrepareService`, bind it with `PREPARE_TOOL_TOKEN` in [`src/cli/prepare-tool/index.ts`](../src/cli/prepare-tool/index.ts), and **do not add** the tool into `NoPrepareTools`.
Prepare services are also where directories, users and config files get created ahead of the install, which is why most language runtimes have one.

Note that apt packages are a bigger ask than a self-contained binary: they persist in any image that installs the tool, they aren't removed by `uninstall-tool`, and they have to resolve on every Ubuntu release we target.
Expect more discussion on the Issue for tools in this category.

#### Legacy shell installers

> [!NOTE]
> Do not add a `.sh` file into `src/usr/local/containerbase/tools/v2`.
>
> These are the legacy installer formats that we are in the process of migrating away from.
> When converting an existing shell tool to a TypeScript install service, see the [tool installer best practices](./tool-installer-best-practices.md) for what to keep and what not to change.

### Kind 3: a tool that must be built from source

Some tools have no usable upstream Linux release, so Containerbase builds and publishes them itself from a dedicated repository, for example:

- [`containerbase/node-prebuild`](https://github.com/containerbase/node-prebuild)
- [`containerbase/php-prebuild`](https://github.com/containerbase/php-prebuild)
- [`containerbase/python-prebuild`](https://github.com/containerbase/python-prebuild)
- [`containerbase/ruby-prebuild`](https://github.com/containerbase/ruby-prebuild)

Creating a new `containerbase/<tool>-prebuild` repository needs a maintainer - it requires a repository under the `containerbase` org, release automation, and publishing credentials.
**Open an issue before doing any work on a tool in this category.**
Once the prebuild repository exists and publishes releases, the install service is written exactly as in [Kind 2](#kind-2-an-upstream-prebuilt-binary), pointing at `https://github.com/containerbase/<tool>-prebuild/releases`.

Maintainers find how to create the prebuild repository in [`new-prebuild-tool.md`](./new-prebuild-tool.md).

## Testing your change

Install Node.js and pnpm with [mise](https://mise.jdx.dev), the scripts need a real `pnpm` on the `PATH`, corepack isn't used.
Then build the CLI before building any image:

```sh
mise install
pnpm install --frozen-lockfile
pnpm build
docker buildx bake
```

Then run the test image that contains your tool:

```sh
TAG=latest docker buildx bake test
```

Or via the helper, which also builds first with `-b`:

```sh
node tools/test.js -b latest
```

The `Dockerfile.arm64` tests build for `linux/arm64`, so an x86_64 host needs QEMU emulation first:

```sh
docker run --privileged --rm tonistiigi/binfmt --install arm64
node tools/test.js -b -t test-aarch64 latest
```

Ignore the remote cache for faster local iteration:

```sh
docker buildx bake --set *.cache-from=
```

Before opening a PR:

```sh
pnpm lint          # formatting, lint, types, docs, markdown, schema and tool list checks
pnpm test:vitest
pnpm test:bats
```

CI runs the test images from a matrix in [`.github/workflows/build.yml`](../.github/workflows/build.yml).
Its `setup` job computes the `lang` matrix from the test directories: each `test/<lang>/Dockerfile` runs on x86_64 and each `test/<lang>/Dockerfile.arm64` on aarch64, so a new test directory needs no workflow change.
A pull request which only changes test Dockerfiles only runs the docker tests of those files.
If you change a workflow, run `mise install` once and check it with `jactionlint` and `zizmor`, like CI's `lint` job does.

## Downstream: tool-versions and Renovate

[containerbase/tool-versions](https://github.com/containerbase/tool-versions) publishes the installable versions per tool (urls, checksums) on GitHub Pages.

In tool-versions:

- [`src/tools.ts`](https://github.com/containerbase/tool-versions/blob/main/src/tools.ts): datasource, package, versioning, `sourceUrl`, `homepage`; a file template with the install service's urls and checksums for non-release-asset downloads
- tools with a `type` (`pip`, `npm`, `gem`, `dotnet`): source only, no files
- [`renovate.Dockerfile`](https://github.com/containerbase/tool-versions/blob/main/renovate.Dockerfile): one line per maintained release line

The [`@containerbase/base`](https://www.npmjs.com/package/@containerbase/base) update in tool-versions fails until new typed tools are mapped and removed ones unmapped.

Order:

1. A new install service ([Kind 2](#the-tool-versions-data-first)): the tool-versions mapping with a `toolExceptions` entry first, then the CLI change with the updated tool-versions dependency and the release; the `@containerbase/base` update in tool-versions removes the exception.
1. A `pip`, `npm` or `gem` tool: the CLI change and release first, then the tool-versions mapping.
1. Renovate's weekly update of the pinned tool-versions release embeds new versions in the next Containerbase image.

To use the tool in Renovate: [wait for Renovate's Docker image](https://docs.renovatebot.com/docker-build-process/#build-process-flow), then add it to [`allToolConfig` in `lib/util/exec/containerbase.ts`](https://github.com/renovatebot/renovate/blob/HEAD/lib/util/exec/containerbase.ts).

## What am I able to do as a Contributor vs what do I need to wait for a maintainer to do?

Anyone can open a PR for:

- adding a `pip` / `npm` / `gem` tool to `ResolverMap`
- adding a tool to the [tool-versions](https://github.com/containerbase/tool-versions) data
- writing a new install service for a tool with upstream Linux release artifacts
- version resolvers, prepare services
- test image entries, Renovate config entries and docs

A maintainer is needed for:

- creating a new `containerbase/<tool>-prebuild` repository, and the release automation and credentials that go with it
- cutting the Containerbase release that makes the tool available downstream
- decisions about whether a tool belongs in the base image at all - if in doubt, open an issue first
