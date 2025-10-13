# Created databases

The cli is creating some databases for the tools it manages.
Currently [`@seald-io/nedb`](https://github.com/seald/nedb) is used.
It's planned to eventually switch to [`node:sqlite`](https://nodejs.org/api/sqlite.html) when it becomes stable.

## List of created databases

- `links`: Stores information about linked tool versions.
- `state`: Stores information about all the current linked version of installed tools.
- `types`: Stores information about all the installer types of tools.
- `versions`: Stores information about installed tool versions.

## `links`

Stores information about linked tool versions.
It stores which tool and version a shell wrapper was created from.

**Meta:**

- `name`: file name
- `tool`: the tool the file is linked to
  - `name`: tool name
  - `version`: tool version

**Index:**

- `name` (`unique`): only one can exist
- `tool.name` and `tool.version`: find links by current tool version

## `state`

Stores information about all the current linked version of installed tools.

**Meta:**

- `name`: tool name or alias
- `tool`: the tool and version
  - `name`: tool name
  - `version`: tool version

**Index:**

- `name` (`unique`): only one can exist

## `types`

Stores information about all the installer types of tools.
Can be `gem`, `npm` or `pip`.
It's used to add proper dynamic installer services.

**Meta:**

- `name`: tool name
- `type`: the tool installer type

**Index:**

- `name` (`unique`): only one can exist

## `versions`

Stores the installed tool versions with an optional parent.

**Meta:**

- `name`: tool name
- `version`: tool version
- `parent`: the optional parent tool and version this tool depends on
  - `name`: tool name
  - `version`: tool version

**Index:**

- `name`: search all installed versions
- `name` and `version`: is a version installed
- `parent.name` and `parent.version` (`sparse`): find childs by current tool version
- `name`, `version`, `parent.name` and `parent.version` (`unique`): is a version installed
