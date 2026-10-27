# Created databases

The cli is creating a database for the tools it manages.
It's a [`node:sqlite`](https://nodejs.org/api/sqlite.html) database stored in `/opt/containerbase/data/containerbase.db`.
The schema version is stored in `PRAGMA user_version`, it's currently `1`.
A database with a newer schema version, created by a newer containerbase version, fails with an error asking to update containerbase.
The journal mode is `DELETE`, so the database can be opened read-only.

## Read-only file system

When the data folder isn't writable, eg. on a read-only root file system, the database is opened read-only and only read.
`containerbase-cli list tools` always opens it read-only, after the [migration](#migration-from-older-versions) when the data folder is writable.
When the data folder is writable, a journal left by an interrupted writer is rolled back first, by opening the database writable once just for a read, nothing else is changed.
When this fails, eg. because of missing permissions, the database is opened read-only anyway.
On a read-only data folder such a journal can't be rolled back, so reading the database fails until a writable run, eg. an image rebuild, cleans it up.
Installing tools on a read-only file system isn't supported.

Without a database, the [databases of an older version](#migration-from-older-versions) are loaded into memory without migrating them, so an image built with an older containerbase version keeps working.
Without any database an empty one is used, so no tools are found.

## Build-time database on a volume

On a volume at `/opt/containerbase`, see the [volume section](./custom-base-image.md#volume-at-optcontainerbase), the database on the volume only holds the runtime state.
The state of the image build comes from the database of the [build-time snapshot](./custom-base-image.md#build-time-snapshot), `/var/lib/containerbase/opt/data/containerbase.db`, which is attached read-only as `base`.
So an image update brings its build-time versions, links, current versions and types, without copying them onto the volume.
It's attached when the volume was restored from the snapshot, which `/opt/containerbase/.restored` marks, or still needs a restore, eg. for a dry run before the first restore.
Without a volume, eg. at build time or with the image's own `/opt/containerbase`, nothing is attached.
A build-time database without a schema is ignored, one with a newer schema version fails with an error asking to update containerbase.

The cli reads through temporary views named like the tables, which combine both databases, writes only go to the database on the volume:

- `versions`: the versions of both databases.
- `links`, `state` and `types`: keyed by `name`, a row on the volume overrides the build-time row with the same name.
- A [`tombstones`](#tombstones) row hides exactly one build-time row, eg. after uninstalling a build-time version at runtime.
  Such a version stays uninstalled after an image update, also its folder, wrappers and version file aren't restored while the build-time database still has that row.
  Overriding a build-time link with another tool version adds a tombstone for the build-time link, so removing the runtime link doesn't bring it back.
  Adding the row again removes the tombstone.
- The restore reads the tombstones of the database on the volume read-only, after rolling back a journal left by an interrupted writer.

On a volume docker filled from the image, the rows equal to a build-time row were copied from the image, so the first restore, before `.restored` exists, removes them.
Later, such rows are runtime state and are kept, eg. a version installed at runtime which a newer image also installs at build time.
After an image update the new build-time rows are used instead.

## Migration from older versions

Older containerbase versions stored the data in [`@seald-io/nedb`](https://github.com/seald/nedb) databases, the files `links.nedb`, `state.nedb`, `types.nedb` and `versions.nedb` in the data folder.
They are migrated once into the new database when it's created and deleted afterwards.
Malformed lines and documents are skipped with a warning, a file with skipped documents is kept.
It isn't read again while `containerbase.db` exists, so it can be inspected and deleted once it's no longer needed.
A downgrade to an older containerbase version isn't possible after the migration.

The migration needs a writable data folder.
On a read-only file system the old databases are only [read](#read-only-file-system), they are migrated on the first writable run, eg. when a tool is installed with the new containerbase version as part of the image build.

## Concurrent cli calls

Run containerbase cli calls one after another, not in parallel.
The cli doesn't lock against other cli processes, so parallel installs or uninstalls, especially of the same tool, can conflict with each other.

The database itself stays consistent with parallel readers and writers: a writer waits up to five seconds for another one, the migration runs only once, and a reader treats a database whose schema is just being created as missing.
A reader that loads the old databases while another process migrates them uses the migrated database instead.
Processes started by the cli itself, like the tool wrappers or the installers of older tools, are fine.

## List of created tables

- `links`: Stores information about linked tool versions.
- `state`: Stores information about all the current linked version of installed tools.
- `tombstones`: Stores the build-time rows removed at runtime.
- `types`: Stores information about all the installer types of tools.
- `versions`: Stores information about installed tool versions.

A database of an older schema without `tombstones` gets it on the first writable open, a read-only one uses an empty temporary table.

## `links`

Stores information about linked tool versions.
It stores which tool and version a shell wrapper was created from.

**Columns:**

- `name` (`primary key`): file name, only one can exist
- `tool_name`: name of the tool the file is linked to
- `tool_version`: version of the tool the file is linked to

**Index:**

- `links_tool`: `tool_name` and `tool_version`, find links by current tool version

## `state`

Stores information about all the current linked version of installed tools.

**Columns:**

- `name` (`primary key`): tool name or alias, only one can exist
- `tool_name`: tool name
- `tool_version`: tool version
- `parent_name`: the optional parent tool name, `''` without a parent
- `parent_version`: the optional parent tool version, `''` without a parent

## `tombstones`

Stores the rows of the [build-time database](#build-time-database-on-a-volume) which were removed at runtime, so they are hidden.

**Columns:**

- `tbl`: the table of the hidden row, `versions`, `links`, `state` or `types`
- `name`: name of the hidden row
- `row`: the other columns of the hidden row as a json array, eg. `["22.0.0","",""]` for a `versions` row or `["node","22.0.0"]` for a `links` row

The combination of `tbl`, `name` and `row` is `unique`, a name can have several tombstones.
A tombstone hides exactly this row, so a newer image's row with the same name but other values, eg. another current version, is used.

## `types`

Stores information about all the installer types of tools.
Can be `gem`, `npm` or `pip`.
It's used to add proper dynamic installer services.

**Columns:**

- `name` (`primary key`): tool name, only one can exist
- `type`: the tool installer type

## `versions`

Stores the installed tool versions with an optional parent.

**Columns:**

- `name`: tool name
- `version`: tool version
- `parent_name`: the optional parent tool name this tool depends on, `''` without a parent
- `parent_version`: the optional parent tool version this tool depends on, `''` without a parent

`name`, `version`, `parent_name` and `parent_version` are `unique`, a version can be installed once per parent.

**Index:**

- `versions_name`: `name`, search all installed versions
- `versions_parent`: `parent_name` and `parent_version`, find childs by current tool version
