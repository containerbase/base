# Tool installer best practices

Conventions for adding or changing a tool installer, including converting a legacy shell tool.

See [`new-tool.md`](./new-tool.md) for the full walkthrough of adding a tool; this page collects the rules that apply across installers.

## Implementation

Every tool is a TypeScript install service extending `BaseInstallService` ([`src/cli/install-tool/base-install.service.ts`](../src/cli/install-tool/base-install.service.ts)), living under [`src/cli/tools/`](../src/cli/tools/).

Do not add new `.sh` files under `src/usr/local/containerbase/tools/v2`.
Both the v1 and v2 shell tool formats are deprecated and being migrated to TypeScript install services.

When converting a legacy shell tool, keep installing every version the shell script could install.
Raising the minimum supported version is a separate, breaking change, not part of a conversion.

## Downloads and checksums

Always download through `this.http.download` rather than fetching yourself - it applies the [url replacements](./custom-registries.md) and the [CDN](./cdn.md) resolution.

Download from the [tool-versions](https://github.com/containerbase/tool-versions) data first, when it lists the tool.
It has the files and checksums of the versions, so no checksum file is downloaded:

- `this.downloadChecksumListed(version, baseUrl, filename, list)` - for a checksum list file in the release folder.
  It downloads the file named `filename` of the data, else `filename` of the folder, verified against the checksum `list`.
  Make sure `filename` is the file name the data lists for the host, a tool can have several files per arch.
- `this.downloadChecksumSidecar(version, url, sidecar, { checksumType?, name? })` - for a `.sha256`-style sidecar file, like `${url}.sha256`.
  It downloads the file of the data named like the last url segment, else the file, verified against its sidecar.
  Pass `name` when the data names the file differently, it's also the name of the downloaded file.
- `this.downloadWithoutChecksum(version, url, name?)` - for releases without an upstream checksum, like bazelisk or older docker-compose releases.
  The data has a computed checksum for them when the tool's entry in the tool-versions `src/tools.ts` sets `checksum: { compute: true }` or `computeMissing`, like docker's, or when its datasource computes it, like nuget's; without data the file is downloaded unverified.
  The data can also have an upstream checksum the installer doesn't read itself, like dotnet's sha512 from its release metadata.
  Pass `name` when the data names the file differently, like docker.
- `this.downloadNamedToolFile(version, name)` - the data file named `name`, for installers with their own fallback, like golang and maven.
  It returns `undefined` without that file for the host.
- `this.downloadDistroToolFile(version, host, fallback)` - the data file of the host distro, else the one of `fallback`, like jammy for newer ubuntu releases.
  The containerbase prebuilds with distro builds extend `PrebuildInstallService` ([`src/cli/tools/utils/prebuild.ts`](../src/cli/tools/utils/prebuild.ts)), which does this and falls back to the jammy prebuild and its `.sha512`.
- `this.downloadToolFile(version, distro?, filter?)` - for other upstream layouts.
  It returns `undefined` without a data file for the host, so the installer can fall back to its own download.

Verify every other download against an upstream checksum.
`BaseInstallService` has shared helpers for this, which throw when the checksum is missing:

- `this.findChecksum(url, filename)` - for a checksum list file, one `<checksum>  <filename>` line per file.
  It strips a leading `./` or `*` from the listed name before comparing, and decodes UTF-16 files, like PowerShell's `hashes.sha256`, correctly.
- `this.getChecksum(url)` - for a single `.sha256`-style sidecar file, ignoring any filename after the checksum.
- `this.downloadOptionalChecksumSidecar(url, sidecar, checksumType)` - downloads a file verified against its sidecar, for releases which may lack it, like the maven and golang prebuilds.
  It returns `undefined` without the sidecar file and doesn't use the tool-versions data, combine it with `this.downloadNamedToolFile`.

When upstream only started publishing checksums, or switched archive formats, from some version on, pick the right one by version with `semverGte` rather than probing URLs.
For four-part versions, like cabal's `3.18.1.0`, coerce first with `semverCoerce`.
Download older releases that have no upstream checksum with `this.downloadWithoutChecksum`, so nothing that worked before breaks.
This is an explicit compatibility exception: without data it skips integrity validation, so name the cutoff in a comment, and use another trusted integrity check if upstream offers one:

```ts
// sbt only publishes a `.sha256` checksum file since v1.3.5.
const file = semverGte(version, '1.3.5')
  ? await this.downloadChecksumSidecar(version, url, '.sha256')
  : await this.downloadWithoutChecksum(version, url);
```

Real examples worth reading:

- [`src/cli/tools/java/sbt.ts`](../src/cli/tools/java/sbt.ts) - a `.sha256` sidecar published since v1.3.5.
- [`src/cli/tools/dotnet/powershell.ts`](../src/cli/tools/dotnet/powershell.ts) - a `hashes.sha256` list, UTF-16 encoded, published since v7.2.0.
- [`src/cli/tools/rust.ts`](../src/cli/tools/rust.ts) - a `.tar.xz` archive since v1.19.0 (and nightly since 2017-05-05), `.tar.gz` before.
- [`src/cli/tools/haskell/cabal.ts`](../src/cli/tools/haskell/cabal.ts) - a generic `linux-unknown` build since v3.18, a static `linux-deb10` one before.

List every URL the tool downloads from, including checksum files, in [`docs/custom-registries.md`](./custom-registries.md).
This is what lets users behind a proxy configure url replacements for all of them.

## Folders, ownership and links

Create folders below the versioned tool path with `this.pathSvc.createVersionedToolPath(tool, version, ...subPaths)` (e.g. `'bin'`), or `this.pathSvc.createDir` for anything else.
Never use a plain `fs.mkdir` - these helpers make the folder owned by the configured user when installing as root, not just root.

Prepare steps can run again on an existing image, so link a tool's home folder into the cache with `this.pathSvc.createSymlink(target, path)`.
It keeps anything that already exists at `path`, rather than overwriting it:

```ts
override async prepare(): Promise<void> {
  await this.initialize();

  await this.pathSvc.createSymlink(
    join(this.pathSvc.cachePath, '.cargo'),
    join(this.envSvc.userHome, '.cargo'),
  );
}
```

Declare the folders in the cache which only hold data the tool downloads again, like a package cache, in `cacheDirs` on the install service, relative to the cache path.
[`containerbase-cli cleanup cache`](./tools.md#cleanup-cache-command) removes them, so never list config files or folders holding them, and list a sub folder where needed:

```ts
override readonly cacheDirs = ['.cargo/git', '.cargo/registry'];
```

Caches in the containerbase user's `~/.cache`, the `.cache` folder in the cache path, need no entry, its contents are always removed.
Root's `/root/.cache` isn't touched.

See [`src/cli/services/path.service.ts`](../src/cli/services/path.service.ts) for the full set of path helpers before reaching for `node:fs` directly.

At image build time, the folder an install created is moved into the [build-time snapshot](./custom-base-image.md#build-time-snapshot) and linked back, by default `versionedToolPath(tool, version)`.
An installer writing somewhere else must override `snapshot` and `removeSnapshot`, like `dotnet`, which shares one tool path for all versions, or tools installed below a parent version, which use `snapshotParentFolder`.
A build-time install which leaves no folder to move logs a warning.

## Shared helpers

Logic that several installers repeat belongs in a protected helper on `BaseInstallService`, or a method on `PathService`, not copied into each tool or dropped into a loose utils file.
`findChecksum`, `getChecksum` and `shellwrapper` are examples of this: every installer that needs them calls the shared helper instead of reimplementing it.

## Tests and documentation

Every install service needs a spec.
Cover version boundaries such as a checksum cutoff on both sides - the version before and the version at or after the cutoff.

Every function a pull request adds or changes needs a JSDoc comment; the docstring coverage check enforces this.

In specs, build real mock objects instead of forcing types with `as never` or similar escape-hatch casts.
Write multi-line expected strings with the `codeBlock` tag from `common-tags`, so they stay indented with the surrounding code:

```ts
scope(baseUrl)
  .get(`${releaseUrl}/SHA256SUMS`)
  .reply(
    200,
    codeBlock`
      ${checksum(tarball)} ./cabal-install-${version}-aarch64-linux-unknown.tar.xz
      ${checksum(tarball)} ./${filename}
    `,
  );
```
