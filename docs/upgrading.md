# Upgrading

The breaking changes of each major release and what to do instead.

## v15

- Ubuntu 22.04 (jammy) is no longer supported, use Ubuntu 24.04 (noble) or 26.04 (resolute) ([#6611](https://github.com/containerbase/base/issues/6611)).
- The deprecated `bower` and `lerna` tools are removed, install them with `install-npm` if you still need them ([#7552](https://github.com/containerbase/base/issues/7552)).
- The tool databases are stored in sqlite, `/opt/containerbase/data/containerbase.db`.
  The nedb databases of an older version are imported once, after that older containerbase versions can't read the state any more ([#7963](https://github.com/containerbase/base/pull/7963), see [databases](./databases.md)).
- git comes from the containerbase git prebuild instead of Ubuntu's package ([#7778](https://github.com/containerbase/base/issues/7778), see [git](./custom-base-image.md#git)):
  - Nothing is linked into `/usr/bin` any more, use `git` from the `PATH` or `/usr/local/bin/git` ([#7822](https://github.com/containerbase/base/issues/7822)).
  - `git`, `git-upload-pack`, `git-receive-pack`, `git-shell`, `git-upload-archive` and `scalar` are [shims](./linking.md) whose wrappers run the binaries in `/opt/containerbase/tools/git/<version>`, not Ubuntu's binaries in `/usr/bin`.
  - `install-tool git <version>` installs exactly that version, a version without a git-prebuild release fails, see the minimum below.
    Switch Renovate comments from `datasource=github-tags packageName=git/git` to `datasource=github-releases packageName=containerbase/git-prebuild`.
  - `perl`, `liberror-perl` and `git-man` aren't installed any more, install `perl` and `liberror-perl` with `install-apt` if you need them ([#7821](https://github.com/containerbase/base/issues/7821)).
  - git lives in `/opt/containerbase` like the other tools, so on an empty [volume](./custom-base-image.md#volume-at-optcontainerbase) its first call installs it again, which needs network access.
- The containerbase env, `/usr/local/etc/env`, keeps a non-empty, writable `HOME` other than `/` of a non-root user now, explicit or not, for all tools, also for git called without the entrypoint.
  An empty or `/` `HOME`, or one which isn't a writable and searchable folder, is replaced by the containerbase user's home.
  Java's `ANDROID_HOME` now points to the containerbase user's `.android-sdk`, also with a custom `HOME` and for root, which used `/root/.android-sdk` before; set `ANDROID_HOME` to use another SDK.
- `prepare-tool golang` no longer installs `mercurial` and `bzr`. Install `mercurial` with `install-tool mercurial` (needs python) if you fetch Mercurial modules without the Go proxy, and `bzr` with `install-apt bzr` for Bazaar modules with a Go before 1.27 ([#8022](https://github.com/containerbase/base/issues/8022)).
- Installing a version older than the tool's minimum supported version fails, use the minimum or a newer version ([#7772](https://github.com/containerbase/base/issues/7772)).
  `git` is an exception: a version below its minimum, a partial version without a match in the tool-versions data or any other version which isn't an exact `X.Y.Z` one, like a prerelease `2.57.0-rc0`, installs the newest prebuild instead, with a warning.
  The minimums are published in the [`@containerbase/base` package](../packages/base/README.md), see [minimum versions](./tools.md#Minimum-versions-install-tool).
- Packages of `install-npm`, `install-pip` and `install-gem` are installed and listed as `npm+<name>`, `pip+<name>` and `gem+<name>`, also in `containerbase-cli list tools` ([#8121](https://github.com/containerbase/base/issues/8121)).
  A package named like a tool installs the package now, not the tool, use `install-tool` for the tool.
  `uninstall-npm`, `uninstall-pip` and `uninstall-gem` only remove packages, a tool installed with `install-tool`, like `pnpm` or `checkov`, isn't removed and the command fails, remove it with `uninstall-tool <name>`.
  Packages installed by v14 are migrated automatically, also in the build-time list of a volume.
  On a read-only file system the databases of v14 aren't migrated, so `containerbase-cli list tools` shows their packages without the type there.
