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
- Installs latest pnpm version
  ```bash
  install-pip checkov
  ```

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
