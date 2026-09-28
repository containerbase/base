# Tool installer best practices

Conventions for adding or changing a tool installer, including converting a legacy shell tool.

See [`new-tool.md`](./new-tool.md) for the full walkthrough of adding a tool; this page collects the rules that apply across installers.

## Implementation

Every tool is a TypeScript install service extending `BaseInstallService` ([`src/cli/install-tool/base-install.service.ts`](../src/cli/install-tool/base-install.service.ts)), living under [`src/cli/tools/`](../src/cli/tools/).

Do not add new `.sh` files under [`src/usr/local/containerbase/tools/v2`](../src/usr/local/containerbase/tools/v2/).
Both the v1 and v2 shell tool formats are deprecated and being migrated to TypeScript install services.

When converting a legacy shell tool, keep installing every version the shell script could install.
Raising the minimum supported version is a separate, breaking change, not part of a conversion.

## Downloads and checksums

Always download through `this.http.download` rather than fetching yourself - it applies the [url replacements](./custom-registries.md) and the [CDN](./cdn.md) resolution.

Verify every download against an upstream checksum.
`BaseInstallService` has two shared helpers for this, both of which throw when the checksum is missing:

- `this.findChecksum(url, filename)` - for a checksum list file, one `<checksum>  <filename>` line per file.
  It strips a leading `./` or `*` from the listed name before comparing, and decodes UTF-16 files, like PowerShell's `hashes.sha256`, correctly.
- `this.getChecksum(url)` - for a single `.sha256`-style sidecar file, ignoring any filename after the checksum.

When upstream only started publishing checksums, or switched archive formats, from some version on, pick the right one by version with `semverGte` rather than probing URLs.
For four-part versions, like cabal's `3.18.1.0`, coerce first with `semverCoerce`.
Download older releases without `expectedChecksum` so nothing that worked before breaks:

```ts
// sbt only publishes a `.sha256` checksum file since v1.3.5.
const expectedChecksum = semverGte(version, '1.3.5')
  ? await this.getChecksum(`${url}.sha256`)
  : undefined;
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

See [`src/cli/services/path.service.ts`](../src/cli/services/path.service.ts) for the full set of path helpers before reaching for `node:fs` directly.

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
