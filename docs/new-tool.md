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

| Kind                                              | Work required                               | Who                        | Examples                                                                                                           |
| ------------------------------------------------- | ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A `pip`, `npm` or `gem` package                   | One map entry plus tests                    | Contributor                | [`kas`](https://github.com/containerbase/base/pull/6525)                                                           |
| Upstream ships a prebuilt Linux binary or archive | A new install service plus tests            | Contributor                | [`buf`](https://github.com/containerbase/base/pull/6379), [`apm`](https://github.com/containerbase/base/pull/7038) |
| The tool has to be compiled from source           | A new `containerbase/*-prebuild` repository | Maintainer (**ask first**) | `php`, `python`, `ruby`, `node`                                                                                    |

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

Note the arm64 test files use one image stage per tool, terminating in a `COPY --from=test-<tool> /.dummy /.dummy` line in the final stage - add both halves.

### Kind 2: an upstream prebuilt binary

Before starting, check that upstream meets these requirements:

- self-contained Linux binaries or archives for **both** `amd64` and `arm64`
- a stable, predictable download URL that contains the version
- **published checksums** - Containerbase verifies every download. If a tool doesn't have upstream checksums published, this will block proceeding with adding the tool to Containerbase, so it's worth raising that upstream first.
- a license that allows us to redistribute the binaries inside our images. The Issue template asks for the SPDX identifier of the tool _and_ of any prebuilt binaries, so it's worth checking early rather than discovering a blocker after the code is written.

#### The install service

Create `src/cli/tools/<tool>.ts` (or a subdirectory if the tool belongs to an existing language family, e.g. `src/cli/tools/java/`).

For instance, [`src/cli/tools/buf.ts`](../src/cli/tools/buf.ts) is a good template:

```ts
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class BufInstallService extends BaseInstallService {
  readonly name = 'buf';

  // `this.envSvc.arch` is 'amd64' | 'arm64'; map it to whatever upstream names its assets
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/bufbuild/buf/releases/download/v${version}/`;
    const filename = `buf-Linux-${this.ghArch}.tar.gz`;

    // download the checksum file and pick out the line for our asset
    const checksumFile = await this.http.download({
      url: `${baseUrl}sha256.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    // `http.download` applies url replacements and CDN resolution for us
    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
      files: ['buf/bin/buf'],
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
```

Things worth knowing:

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

Two more things worth knowing:

- If you attempt to uninstall a tool that other installed tools depend on (by declaring it as a `parent`), Containerbase will refuse to uninstall until `--recursive` is passed
- Legacy shell tools cannot be uninstalled at all - `uninstall-tool` returns `NotSupported` for them

#### Optional: a version resolver

Add a `ToolVersionResolver` if `install-tool <tool>` with no version should install the latest release.

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
   This is what lets users behind a proxy configure their replacements, so list the checksum files and any version-lookup endpoints too, for both architectures.
   Follow the shape of the existing sections - a `## <tool>` heading, the release URLs, then a `txt` block of sample download URLs.

1. Tests - add the tool to:
   - [`test/latest/Dockerfile`](../test/latest/Dockerfile), in one of the grouped stages (and update that stage's `# test: ...` comment)
   - [`test/latest/Dockerfile.arm64`](../test/latest/Dockerfile.arm64), as its own `FROM base AS test-<tool>` stage plus a `COPY --from=test-<tool> /.dummy /.dummy` line in the final stage
   - [`test/Dockerfile.distro`](../test/Dockerfile.distro) if the tool should be verified across Ubuntu releases

   Each pinned version needs a Renovate comment:

   ```dockerfile
   # renovate: datasource=github-releases packageName=bufbuild/buf
   RUN install-tool buf v1.72.0
   ```

1. [`.github/renovate.json`](../.github/renovate.json) - add the tool name to both `matchDepNames` lists.

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
> Do not add a `.sh` file into [`src/usr/local/containerbase/tools/v2`](../src/usr/local/containerbase/tools/v2/).
>
> These are the legacy installer formats that we are in the process of migrating away from.

### Kind 3: a tool that must be built from source

Some tools have no usable upstream Linux release, so Containerbase builds and publishes them itself from a dedicated repository, for example:

- [`containerbase/node-prebuild`](https://github.com/containerbase/node-prebuild)
- [`containerbase/php-prebuild`](https://github.com/containerbase/php-prebuild)
- [`containerbase/python-prebuild`](https://github.com/containerbase/python-prebuild)
- [`containerbase/ruby-prebuild`](https://github.com/containerbase/ruby-prebuild)

Creating a new `containerbase/<tool>-prebuild` repository needs a maintainer - it requires a repository under the `containerbase` org, release automation, and publishing credentials.
**Open an issue before doing any work on a tool in this category.**
Once the prebuild repository exists and publishes releases, the install service is written exactly as in [Kind 2](#kind-2-an-upstream-prebuilt-binary), pointing at `https://github.com/containerbase/<tool>-prebuild/releases`.

> [!IMPORTANT]
> This will be further documented in the future for maintainers to follow.

## Testing your change

Build the CLI before building any image:

```sh
pnpm install
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

Ignore the remote cache for faster local iteration:

```sh
docker buildx bake --set *.cache-from=
```

Before opening a PR:

```sh
pnpm lint          # prettier, eslint, tsc, markdownlint
pnpm test:vitest
pnpm test:bats
```

CI runs the test images from a matrix in [`.github/workflows/build.yml`](../.github/workflows/build.yml).
The `lang` matrix entries map to directories under [`test/`](../test/), so a brand-new test directory also needs a matrix entry.
Adding to an existing test image needs no workflow change.

## Downstream: Renovate

Adding a tool here only makes it installable in the `containerbase/base` image.

It is likely that you're looking at add a tool so [Renovate](https://docs.renovatebot.com/) can use it.

Once your PR is merged, you will need to [wait for the Containerbase changes to reach Renovate's Docker image](https://docs.renovatebot.com/docker-build-process/#build-process-flow).

After this is available, you will need to add the tool into [`allToolConfig` in `lib/util/exec/containerbase.ts`](https://github.com/renovatebot/renovate/blob/HEAD/lib/util/exec/containerbase.ts).

## What am I able to do as a Contributor vs what do I need to wait for a maintainer to do?

Anyone can open a PR for:

- adding a `pip` / `npm` / `gem` tool to `ResolverMap`
- writing a new install service for a tool with upstream Linux release artifacts
- version resolvers, prepare services
- test image entries, Renovate config entries and docs

A maintainer is needed for:

- creating a new `containerbase/<tool>-prebuild` repository, and the release automation and credentials that go with it
- cutting the Containerbase release that makes the tool available downstream
- decisions about whether a tool belongs in the base image at all - if in doubt, open an issue first
