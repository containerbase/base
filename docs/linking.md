# How tools are linked

Every command of an installed tool, like `node` or `npm`, is a static shim in `/opt/containerbase/bin`.
The shim sources a per-version wrapper, which a pointer in `/opt/containerbase/links` selects.
A tool version which is gone from the disk is installed again when one of its commands is called.

## Layout

| Path                                                                     | Content                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `/opt/containerbase/bin/<command>`                                       | The shim, the same for every tool, only the command name differs.               |
| `/opt/containerbase/links/<command>`                                     | The pointer: a symlink to the per-version wrapper the command runs.             |
| `/opt/containerbase/tools/<tool>/<version>/.wrappers/<command>`          | The per-version wrapper.                                                        |
| `/opt/containerbase/tools/<tool>/<version>/<parent>/.wrappers/<command>` | The per-version wrapper of an `npm`, `pip` or `gem` tool, for a parent version. |

The per-version wrapper loads the containerbase env, initializes the tool on its first call, loads the tool envs and runs the tool.
It's written when the version is linked, and only when its content differs, so linking a version which is already installed doesn't touch its folder.
It's removed with the version folder.

The shim is written once and never changes:

```bash
#!/bin/bash
if [[ ! -f /opt/containerbase/links/<command> ]]; then
  [[ -z "${CONTAINERBASE_ENSURE}" ]] || exit 127
  CONTAINERBASE_ENSURE=1 CONTAINERBASE_LOG_LEVEL=warn /usr/local/sbin/containerbase-cli ensure <command> </dev/null >&2 || exit
fi
. /opt/containerbase/links/<command>
```

It sources the wrapper, so a call still starts one bash, and `$0` and the arguments are the shim's.
It runs without the entrypoint of the image.

## Which version a command runs

The pointer is written and removed together with the row of the command in the [`links` database](./databases.md#links).
Installing a version points the commands it links at its wrappers.
A command which only the previous version provides keeps its pointer, so `python3.11` still runs python 3.11 after python 3.12 was installed, and the `corepack` of node 24 stays after installing node 25.

Uninstalling a version removes the shim, the pointer and the row of every command which points at it.

The v1 and v2 shell tools, the `link-tool` command and the ipc server of a running install keep writing the full wrapper into `bin`, and remove a stale pointer of the command.

## `containerbase-cli ensure`

The shim calls `containerbase-cli ensure <command>` when the pointer is missing or dangling, eg. because the version folder was deleted:

1. Without a row for the command in the `links` database it fails with `command not installed, run install-tool <tool> <version>` and the exit code `127`.
1. When the wrapper of the version exists and only the pointer is missing, it recreates the pointer and installs nothing.
1. Otherwise it installs the version the command points at again, after the current parent version when that is missing too, and writes the per-version wrappers.
   The commands which point at that version are pointed at the new wrappers, as the parent version folder of an `npm`, `pip` or `gem` tool may have changed.

It never changes which version any command runs: no shim, links row, current version or versions row is written, and the tool test doesn't run.
A failed install removes the partial version folder, so the next call tries again.
It needs network access and write access to the containerbase folders, and fails with the install error otherwise.

It never reads stdin and never writes to stdout, so the output of the command stays what the tool prints.
A shim called from within `ensure`, eg. by an installer, runs as usual when its own pointer exists, and only fails fast with `127` when its pointer is missing too, instead of calling `ensure` again.

`install-tool` installs a version which is recorded as installed again too, when its files are gone.
This doesn't apply to the v1 and v2 shell tools.
The shim of `git` installs its files again as the user too, as its system wide files stay in the image, `install-tool git` still needs root.

## Recovery

- A deleted version folder is installed again on the next call of one of its commands.
- A deleted `/opt/containerbase/links` folder is recreated by `containerbase-cli init tool all`, which recreates the missing pointers for the wrappers which still exist.
  It downloads nothing, a command whose version folder is missing is installed again on its first call.
- A command without a row in the `links` database can't be restored, install the tool again.

A [volume at `/opt/containerbase`](./custom-base-image.md#volume-at-optcontainerbase) uses the same recovery: `init tool all` sets up the shims from the build-time list of the image, and each tool is installed again on its first call.

A setup with a read-only root file system keeps working: the pointers are part of the image.
A call of a command whose version is missing fails there, as the containerbase folders can't be written.
