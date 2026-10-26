# Containerbase Tools

---

- [Prepare](#prepare)
  - [prepare-tool](#prepare-tool-command)
- [Install](#install)
  - [install-tool](#install-tool-command)
  - [install-gem](#install-gem-command)
  - [install-npm](#install-npm-command)
  - [install-pip](#install-pip-command)
- [Uninstall](#uninstall)
  - [uninstall-tool](#uninstall-tool-command)
  - [uninstall-gem](#uninstall-gem-command)
  - [uninstall-npm](#uninstall-npm-command)
  - [uninstall-pip](#uninstall-pip-command)
- [List](#list)
  - [list-tools](#list-tools-command)
- [Cleanup](#cleanup)
  - [cleanup](#cleanup-command)
  - [cleanup-cache](#cleanup-cache-command)
  - [cleanup-downloads](#cleanup-downloads-command)
  - [cleanup-tool](#cleanup-tool-command)

---

## Prepare

### `containerbase-cli prepare tool` <a name="prepare-tool-command"></a>

#### Alias <a name="Alias-prepare-tool"></a>

`prepare-tool`

#### Description <a name="Description-prepare-tool"></a>

Prepares a tool into the container by creating relevant directories,files and links.

#### Usage <a name="Usage-prepare-tool"></a>

`$ containerbase-cli prepare tool [-d,--dry-run] <tools> ...`

`$ prepare-tool [-d,--dry-run] <tools> ...`

#### Examples <a name="Examples-prepare-tool"></a>

- preparing node
  ```bash
  prepare-tool node
  ```
- preparing all tools
  ```bash
  prepare-tool all
  ```

<br>

## Install

### `containerbase-cli install tool` <a name="install-tool-command"></a>

#### Alias <a name="Alias-install-tool"></a>

`install-tool`

#### Description <a name="Description-install-tool"></a>

Installs a tool into the container.

#### Usage <a name="Usage-install-tool"></a>

`$ containerbase-cli install tool [-d,--dry-run] <name> [version]`

`$ install-tool [-d,--dry-run] <name> [version]`

#### Examples <a name="Examples-install-tool"></a>

- Installs node v14.17.0
  ```bash
  install-tool node 14.17.0
  ```
- Installs node with version via environment variable
  ```bash
  NODE_VERSION=14.17.0 install-tool node
  ```
  or
  ```bash
  export NODE_VERSION=14.17.0
  install-tool node
  ```
- Installs latest pnpm version
  ```bash
  install-tool pnpm
  ```
- Installs the newest node 22 release
  ```bash
  install-tool node 22
  ```

#### Tool-specific versions <a name="Versions-install-tool"></a>

Some tools accept partial versions and install a matching release:

- `java`, `java-jre`, `java-jdk`: A major (`21`), major.minor (`11.0`) or major.minor.patch (`11.0.24`) version installs the newest matching GA release.
  A full version with a build, like `17.0.12+7`, is used as is.
  Without a version, or with `latest`, the newest LTS is installed.
- `node`: A major (`22`) or major.minor (`22.11`) version installs the newest matching release.
  Without a version, or with `latest`, the newest LTS is installed.
- `yarn`, `corepack`, `npm`, `pnpm` and any package installed with [`install-npm`](#install-npm-command): A major (`10`) or major.minor (`10.9`) version installs the `latest` dist tag if it matches and is not deprecated, otherwise the newest matching release, prereleases are skipped and deprecated versions are used only if there is no other.
  Without a version, or with `latest`, the `latest` release is installed.
- `conan`, `poetry` and any package installed with [`install-pip`](#install-pip-command): A major (`2`) or major.minor (`2.1`) version installs the newest matching release, prereleases and yanked releases are skipped.
  A version which exists as a release, like `5.2`, is kept, even a yanked one, which pip installs when pinned.
  Without access to pypi.org, eg. for a package from a private index, the version is kept too.
  The lookup uses pypi.org, so a package from a private index whose name also exists on pypi.org should be pinned with a full version.
  A major or major.minor version resolves to the newest matching release even when pip would read it as `X.Y.0`, eg. `poetry 1.8` installs the newest `1.8.x`, not `1.8.0`; pin the full version for an exact one.
  Without a version, or with `latest`, the latest release is installed.
  For `poetry` the latest release is the newest one supported by `poetry-plugin-pypi-mirror`, a partial version ignores that limit.
- `android-sdk-cmdline-tools`: A major (`14`) or major.minor (`14.1`) version installs the newest matching stable release, compared numerically.
  A version which exists as a release, like `13`, is kept; the repository lists versions without zero segments, so `13.0` installs the release listed as `13`.
  The lookup needs the android repository, which the install needs too, so it fails when the repository can't be loaded.
  Without a version, or with `latest`, the `latest` package is installed.
- `cocoapods`, `bundler` and any package installed with [`install-gem`](#install-gem-command): A major (`1`) or major.minor (`1.16`) version installs the newest matching release, prereleases are skipped.
  A version which exists as a release, like `5.2`, is kept.
  Other major or major.minor versions resolve to the newest matching release even when RubyGems would read them as `X.Y.0`, eg. `bundler 2.0` installs the newest `2.0.x`, not `2.0.0`; pin the full version for an exact one.
  The lookup goes to rubygems.org, through the CDN and URL replacements like other lookups, and a configured gem registry is only used for the install, so a gem from a private registry needs a full version, and a partial version fails when rubygems.org can't be reached.
  Without a version, or with `latest`, the latest release is installed.
- `gradle`: A major (`8`) or major.minor (`9.0`) version installs the newest matching stable release, prereleases, milestones, snapshots, nightlies and broken releases are skipped.
  A version which exists as a release, like `8.10` or `6.9`, is kept as given, and so is the version when the release list can't be loaded.
  Other major.minor versions resolve to the newest matching release, eg. `9.0` installs the newest `9.0.x`; pin the full version for an exact one.
  The release list comes from `services.gradle.org/versions/all`, through the CDN and URL replacements like other lookups.
  Without a version, or with `latest`, the current release is installed.
- `maven`: A major (`3`) or major.minor (`3.9`) version installs the newest matching stable release, prereleases like `4.0.0-rc-1` are skipped.
  A version which exists as a release, like `3.0`, is kept, and so is the version when the release list can't be loaded.
  Other major.minor versions resolve to the newest matching release, eg. `3.9` installs the newest `3.9.x`; pin the full version for an exact one.
  The release list comes from Maven Central's `maven-metadata.xml` on repo.maven.apache.org, through the CDN and URL replacements like other lookups.
  Without a version, or with `latest`, the newest containerbase maven prebuild is installed, which is not resolved against Maven Central.
- `nuget`: A major (`6`) or major.minor (`6.11`) version installs the newest matching released and blessed release.
  A version which exists in the nuget feed is kept, and so is the version when `tools.json` can't be loaded.
  Without a version, or with `latest`, the newest released and blessed release is installed.

Any other version is used as is.

<br>

### `containerbase-cli install gem` <a name="install-gem-command"></a>

#### Alias <a name="Alias-install-gem"></a>

`install-gem`

#### Description <a name="Description-install-gem"></a>

Installs a gem package into the container.

Note: requires ruby to be installed.

#### Usage <a name="Usage-install-gem"></a>

`$ containerbase-cli install gem [-d,--dry-run] <name> [version]`

`$ install-gem [-d,--dry-run] <name> [version]`

#### Examples <a name="Examples-install-gem"></a>

- Installs rake 13.0.6
  ```bash
  install-gem rake 13.0.6
  ```
- Installs rake with version via environment variable
  ```bash
  RAKE_VERSION=13.0.6 install-gem rake
  ```
  or
  ```bash
  export RAKE_VERSION=13.0.6
  install-gem rake
  ```
- Installs latest rake version
  ```bash
  install-gem rake
  ```
- Installs the newest rake 13 release
  ```bash
  install-gem rake 13
  ```

#### Tool-specific versions <a name="Versions-install-gem"></a>

A major or major.minor version installs the newest matching release, see the [install-tool versions](#Versions-install-tool).

<br>

### `containerbase-cli install npm` <a name="install-npm-command"></a>

#### Alias <a name="Alias-install-npm"></a>

`install-npm`

#### Description <a name="Description-install-npm"></a>

Installs a npm package into the container.

Note: requires node to be installed.

#### Usage <a name="Usage-install-npm"></a>

`$ containerbase-cli install npm [-d,--dry-run] <name> [version]`

`$ install-npm [-d,--dry-run] <name> [version]`

#### Examples <a name="Examples-install-npm"></a>

- Installs del-cli v5.0.0
  ```bash
  install-npm del-cli 5.0.0
  ```
- Installs del-cli with version via environment variable
  ```bash
  DEL_CLI_VERSION=5.0.0 install-npm del-cli
  ```
  or
  ```bash
  export DEL_CLI_VERSION=5.0.0
  install-npm del-cli
  ```
- Installs latest del-cli version
  ```bash
  install-npm del-cli
  ```
- Installs a del-cli 5 release
  ```bash
  install-npm del-cli 5
  ```

#### Tool-specific versions <a name="Versions-install-npm"></a>

A major or major.minor version installs the matching `latest` release, else the newest matching one, see the [install-tool versions](#Versions-install-tool).

<br>

### `containerbase-cli install pip` <a name="install-pip-command"></a>

#### Alias <a name="Alias-install-pip"></a>

`install-pip`

#### Description <a name="Description-install-pip"></a>

Installs a pip package into the container.

Note: requires python to be installed.

#### Usage <a name="Usage-install-pip"></a>

`$ containerbase-cli install pip [-d,--dry-run] <name> [version]`

`install-pip [-d,--dry-run] <name> [version]`

#### Examples <a name="Examples-install-pip"></a>

- Installs checkov 2.4.7
  ```bash
  install-pip checkov 2.4.7
  ```
- Installs checkov with version via environment variable
  ```bash
  CHECKOV_VERSION=2.4.7 install-pip checkov
  ```
  or
  ```bash
  export CHECKOV_VERSION=2.4.7
  install-pip checkov
  ```
- Installs latest checkov version
  ```bash
  install-pip checkov
  ```
- Installs the newest checkov 2 release
  ```bash
  install-pip checkov 2
  ```

#### Tool-specific versions <a name="Versions-install-pip"></a>

A major or major.minor version installs the newest matching release, see the [install-tool versions](#Versions-install-tool).

<br>

## Uninstall

### `containerbase-cli uninstall tool` <a name="uninstall-tool-command"></a>

#### Alias <a name="Alias-uninstall-tool"></a>

`uninstall-tool`

#### Description <a name="Description-uninstall-tool"></a>

Uninstalls a tool and deletes all files from the container.

Note: Tools that have child tools need to be uninstalled recursively using the `--recursive` flag.

#### Usage <a name="Usage-uninstall-tool"></a>

`$ containerbase-cli uninstall tool [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

`$ uninstall-tool [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

#### Examples <a name="Examples-uninstall-tool"></a>

- Uninstalls node v14.17.0
  ```bash
  uninstall-tool node 14.17.0
  ```
- Uninstalls node v14.17.0 with all child tools
  ```bash
  uninstall-tool node 14.17.0 --recursive
  ```
- Uninstalls all node versions with all child tools
  ```bash
  uninstall-tool node --recursive --all
  ```
- Uninstalls all jb versions

  ```bash
  uninstall-tool jb --all
  ```

- Uninstalls tool with all child tools extended example

  ```bash
  $ install-tool node 22.0.0
   INFO (9): Installing tool node@22.0.0...
   v22.0.0
   10.5.1
   0.26.0
   INFO (9): Install tool node succeeded in 4.3s.

  $ install-tool pnpm 10.20.0
   INFO (10): Installing tool pnpm@10.20.0...
   v10.20.0
   INFO (10): Install tool pnpm succeeded in 1.1s.

  $ uninstall-tool node 22.0.0
   INFO (93): Uninstalling tool node@22.0.0...
   FATAL (93): tool version has child dependencies and cannot be uninstalled
     tool: "node"
     version: "22.0.0"
     childs: [
       {
        "name": "pnpm",
        "version": "10.20.0"
       }
     ]
   FATAL (93): Uninstall tool node failed in 32ms.

  $ uninstall-tool node 22.0.0 -r
   INFO (104): Uninstalling tool node@22.0.0...
   INFO (104): Uninstalling child tool pnpm@10.20.0...
   INFO (104): Uninstall tool node succeeded in 100ms.
  ```

<br>

### `containerbase-cli uninstall gem` <a name="uninstall-gem-command"></a>

#### Alias <a name="Alias-uninstall-gem"></a>

`uninstall-gem`

#### Description <a name="Description-uninstall-gem"></a>

Uninstalls a gem package from the container.

#### Usage <a name="Usage-uninstall-gem"></a>

`$ containerbase-cli uninstall gem [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

`$ uninstall-gem [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

#### Examples <a name="Examples-uninstall-gem"></a>

- Uninstalls rake v13.0.6
  ```bash
  uninstall-gem rake 13.0.6
  ```
- Uninstalls all rake versions
  ```bash
  uninstall-gem rake --all
  ```

<br>

### `containerbase-cli uninstall npm` <a name="uninstall-npm-command"></a>

#### Alias <a name="Alias-uninstall-npm"></a>

`uninstall-npm`

#### Description <a name="Description-uninstall-npm"></a>

Uninstalls a npm package from the container.

#### Usage <a name="Usage-uninstall-npm"></a>

`$ containerbase-cli uninstall npm [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

`$ uninstall-npm [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

#### Examples <a name="Examples-uninstall-npm"></a>

- Uninstalls del-cli v5.0.0

  ```bash
  uninstall-npm del-cli 5.0.0
  ```

- Uninstalls all del-cli versions
  ```bash
  uninstall-npm del-cli --all
  ```

<br>

### `containerbase-cli uninstall pip` <a name="uninstall-pip-command"></a>

#### Alias <a name="Alias-uninstall-pip"></a>

`uninstall-pip`

#### Description <a name="Description-uninstall-pip"></a>

Uninstalls a pip package from the container.

#### Usage <a name="Usage-uninstall-pip"></a>

`$ containerbase-cli uninstall pip [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

`uninstall-pip [-d,--dry-run] [-r,--recursive] [-a,--all] <name> [version]`

#### Examples <a name="Examples-uninstall-pip"></a>

- Uninstalls checkov v2.4.7
  ```bash
  uninstall-pip checkov 2.4.7
  ```
- Uninstalls all checkov versions
  ```bash
  uninstall-pip checkov --all
  ```

<br>

## List

### `containerbase-cli list tools` <a name="list-tools-command"></a>

#### Description <a name="Description-list-tools"></a>

Lists all installed tools and their versions.

The tools are printed as a table, with the currently linked version and any other installed versions.
Tools and versions are sorted alphabetically, with numbers in numeric order, so `9.0.0` comes before `10.0.0`.

A `-` is printed when no version of the tool is currently linked.
That happens when the linked version is uninstalled while other versions of the tool remain installed, as nothing relinks one of them.

With `--json` the list is printed as JSON, so it can be processed programmatically.
The JSON output is described by [the `list-tools.schema.json` JSON Schema](./list-tools.schema.json).
Because containerbase logs to `stdout`, use `--out` to write the output to a file instead.
When writing to a file, JSON output is minified.

#### Usage <a name="Usage-list-tools"></a>

`$ containerbase-cli list tools [--json] [--out <file>]`

#### Examples <a name="Examples-list-tools"></a>

- Lists all installed tools

  ```bash
  $ containerbase-cli list tools
  NAME      VERSION  OTHER VERSIONS
  java-jdk  -        21.0.12+7
  node      22.11.0  20.11.0
  pnpm      10.0.1
  ```

  Here `java-jdk` is installed but not linked, while `node` is linked to `22.11.0` and keeps `20.11.0` installed.

- Lists all installed tools as JSON

  ```bash
  $ containerbase-cli list tools --json
  {
    "tools": [
      {
        "name": "java-jdk",
        "version": null,
        "versions": [{ "version": "21.0.12+7" }]
      },
      {
        "name": "node",
        "version": "22.11.0",
        "versions": [{ "version": "20.11.0" }, { "version": "22.11.0" }]
      },
      {
        "name": "pnpm",
        "version": "10.0.1",
        "versions": [
          {
            "version": "10.0.1",
            "parent": { "name": "node", "version": "22.11.0" }
          }
        ],
        "type": "npm"
      }
    ]
  }
  ```

- Writes the JSON output to a file
  ```bash
  containerbase-cli list tools --json --out /tmp/tools.json
  ```

<br>

## Cleanup

### `containerbase-cli cleanup` <a name="cleanup-command"></a>

#### Description <a name="Description-cleanup"></a>

Runs all cleanups in this order:

1. [`cleanup tool`](#cleanup-tool-command) removes the unlinked tools
1. [`cleanup cache`](#cleanup-cache-command) removes the known tool caches
1. [`cleanup downloads`](#cleanup-downloads-command) evicts the oldest downloads

`CONTAINERBASE_MAX_ALLOCATED_DISK` defaults to `100`, so downloads are only evicted on a full disk, set a lower value, eg. `80`, to evict earlier, see [download cache](../README.md#download-cache).

When a step fails, it's logged and the next step still runs.
The command fails at the end when any step failed.
It fails right away, without running any step, when the tools can't be loaded, eg. because the containerbase folders aren't writable.

#### Usage <a name="Usage-cleanup"></a>

`$ containerbase-cli cleanup [-d,--dry-run]`

#### Examples <a name="Examples-cleanup"></a>

- Runs all cleanups
  ```bash
  containerbase-cli cleanup
  ```
- Logs what all cleanups would remove
  ```bash
  containerbase-cli cleanup --dry-run
  ```

<br>

### `containerbase-cli cleanup cache` <a name="cleanup-cache-command"></a>

#### Description <a name="Description-cleanup-cache"></a>

Removes the known tool caches from `/tmp/containerbase/cache`.

These are the cache folders of every supported tool, whether it is installed or not, eg. the npm cache in `.npm/_cacache`, the pnpm store in `.local/share/pnpm/store`, the maven repository in `.m2/repository` or the go module cache in `go/pkg/mod`.
The contents of the generic `.cache` folder and the virtualenv cache in `.local/share/virtualenv` are removed too.
Config files, like `.npmrc`, `.m2/settings.xml` or the conan profiles, are kept.
When a tool's cache folder or `.cache` itself is a link, eg. to a volume, its target is emptied and the link kept, a link to a missing target is skipped.
Entries inside `.cache` are removed as they are, so a link there is removed, not its target.

The download cache in `CONTAINERBASE_CACHE_DIR` is left alone, use [`cleanup downloads`](#cleanup-downloads-command) for it.
A cache folder or `.cache` entry holding it, eg. `.cache/containerbase`, is skipped.

With `--dry-run` nothing is removed and every path which would be removed is logged.

#### Usage <a name="Usage-cleanup-cache"></a>

`$ containerbase-cli cleanup cache [-d,--dry-run]`

#### Examples <a name="Examples-cleanup-cache"></a>

- Removes all known tool caches
  ```bash
  containerbase-cli cleanup cache
  ```
- Lists the caches which would be removed
  ```bash
  containerbase-cli cleanup cache --dry-run
  ```

<br>

### `containerbase-cli cleanup downloads` <a name="cleanup-downloads-command"></a>

#### Description <a name="Description-cleanup-downloads"></a>

Evicts the oldest files from the download cache in `CONTAINERBASE_CACHE_DIR` down to `CONTAINERBASE_MAX_ALLOCATED_DISK`.

It's the same cleanup which runs after each install, see [download cache](../README.md#download-cache): the oldest files are removed while the disk holding the folder is filled to `CONTAINERBASE_MAX_ALLOCATED_DISK` percent or more.
Nothing is removed when `CONTAINERBASE_CACHE_DIR` isn't set.
`CONTAINERBASE_MAX_ALLOCATED_DISK` defaults to `100`, so only a full disk is cleaned, set a lower value, eg. `80`, to evict earlier, see [download cache](../README.md#download-cache).
With `--dry-run` only the oldest file is logged, as nothing is freed to check the fill level again.

#### Usage <a name="Usage-cleanup-downloads"></a>

`$ containerbase-cli cleanup downloads [-d,--dry-run]`

#### Examples <a name="Examples-cleanup-downloads"></a>

- Evicts the oldest downloads
  ```bash
  containerbase-cli cleanup downloads
  ```
- Logs the oldest download which would be removed
  ```bash
  containerbase-cli cleanup downloads --dry-run
  ```

<br>

### `containerbase-cli cleanup tool` <a name="cleanup-tool-command"></a>

#### Description <a name="Description-cleanup-tool"></a>

Removes all unlinked tools from `/opt/containerbase/tools`.

Every installed tool version which is not the linked one of its tool is uninstalled, together with all tools installed for it, like [`uninstall-tool --recursive`](#uninstall-tool-command) does.
A tool without a linked version, eg. a `java-jdk` while `java` is linked to a `java-jre`, has all its versions uninstalled.

A version is kept, together with all tools installed for it, when:

- a tool installed for it, also indirectly, is the linked version of its tool, eg. an older node version with the linked pnpm version installed for it
- it or a tool installed for it can't be uninstalled, like legacy shell tools, `git`, or tools which need root when not running as root
- a tool installed for it is kept for another version

#### Usage <a name="Usage-cleanup-tool"></a>

`$ containerbase-cli cleanup tool [-d,--dry-run]`

#### Examples <a name="Examples-cleanup-tool"></a>

- Removes all unlinked tool versions

  ```bash
  $ install-tool node 22.0.0
  $ install-tool node 24.0.0
  $ containerbase-cli cleanup tool
   INFO (9): Cleanup tool ...
   INFO (9): Uninstalling unlinked tool node@22.0.0...
   INFO (9): Cleanup tool succeeded in 120ms.
  ```

- Logs the tool versions which would be removed
  ```bash
  containerbase-cli cleanup tool --dry-run
  ```
