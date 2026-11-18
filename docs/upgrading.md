# Upgrading

The breaking changes of each major release and what to do instead.

## v15

- Ubuntu 22.04 (jammy) is no longer supported, use Ubuntu 24.04 (noble) or 26.04 (resolute) ([#6611](https://github.com/containerbase/base/issues/6611)).
- The deprecated `bower` and `lerna` tools are removed, install them with `install-npm` if you still need them ([#7552](https://github.com/containerbase/base/issues/7552)).
- The tool databases are stored in sqlite, `/opt/containerbase/data/containerbase.db`.
  The nedb databases of an older version are imported once, after that older containerbase versions can't read the state any more ([#7963](https://github.com/containerbase/base/pull/7963), see [databases](./databases.md)).
- `/opt/containerbase` can be a mounted volume, filled from a build-time snapshot ([#7956](https://github.com/containerbase/base/issues/7956), see [volume](./custom-base-image.md#volume-at-optcontainerbase)):
  - Only installs as root at image build time update the snapshot, installs as the user need a writable `/opt/containerbase`.
  - Images with their own entrypoint must run `containerbase-cli init tool all` before using the tools.
- git comes from the containerbase git prebuild instead of Ubuntu's package ([#7778](https://github.com/containerbase/base/issues/7778), see [git](./custom-base-image.md#git)):
  - Nothing is linked into `/usr/bin` any more, use `git` from the `PATH` or `/usr/local/bin/git` ([#7822](https://github.com/containerbase/base/issues/7822)).
  - `perl`, `liberror-perl` and `git-man` aren't installed any more, install them with `install-apt` if you need them ([#7821](https://github.com/containerbase/base/issues/7821)).
  - Ubuntu's `git`, `git-man` and `git-lfs` packages are blocked by an apt pin: use `install-tool git-lfs`, `install-apt git` keeps the containerbase git, Ubuntu's git add-ons like `git-svn` can't be installed ([#7779](https://github.com/containerbase/base/issues/7779)).
- `prepare-tool golang` no longer installs `bzr`, run `install-apt bzr` if you still fetch Bazaar modules with an older Go ([#8022](https://github.com/containerbase/base/issues/8022)).
- Installing a version older than the tool's minimum supported version fails, use the minimum or a newer version ([#7772](https://github.com/containerbase/base/issues/7772)).
  The minimums are published in the [`@containerbase/base` package](../packages/base/README.md), see [minimum versions](./tools.md#Minimum-versions-install-tool).
- Packages of `install-npm`, `install-pip` and `install-gem` are installed and listed as `npm+<name>`, `pip+<name>` and `gem+<name>`, also in `containerbase-cli list tools` ([#8121](https://github.com/containerbase/base/issues/8121)).
  A package named like a tool installs the package now, not the tool, use `install-tool` for the tool.
  Packages installed by v14 are migrated automatically.
