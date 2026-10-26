# Custom base image

The following sample can be used to create a `containerbase/base` based image which does not extend `containerbase/base` directly.
Currently only ubuntu noble and resolute based amd64 distros are supported.

You can also use our containerbase from GitHub container registry as `ghcr.io/containerbase/base`.
`containerbase/base` and `ghcr.io/containerbase/base` are exchangeble.
You should always use a specific version which can be found at [docker hub](https://hub.docker.com/r/containerbase/base/tags) or at [GitHub container registry](ghcr.io/containerbase/base)

`install-containerbase` installs `jq` from its GitHub releases, like the tools you install afterwards.
If your build can't reach GitHub, use a mirror as described in [custom registries](./custom-registries.md#jq).

A containerbase image must always have `git` installed (`install-tool git`), as several tools, like `apm`, call it at runtime and fail without it.
Install it before the other tools, as the samples below do.

The image embeds the [tool-versions](https://github.com/containerbase/tool-versions) data of the tools in `/usr/local/containerbase/tool-versions/`, it comes with the `COPY --from=containerbase /usr/local/containerbase/ /usr/local/containerbase/` line of the samples.
The build downloads the release pinned in `tools/tool-versions.ts` and verifies its checksum, Renovate updates the pin weekly.

## Default user name and id

Use this template for using a custom base image with our default user named `ubuntu` and userid `12021`.

```dockerfile
# This containerbase is used for tool intallation and user/directory setup
FROM containerbase/base AS containerbase

FROM amd64/ubuntu:noble AS base

# Allows custom apt proxy usage
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/ubuntu/bin:$PATH LANG=C.UTF-8 LC_ALL=C.UTF-8
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

# Optional: Add custom root certificate, should come before `install-containerbase`
COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt

# Set up containerbase
COPY --from=containerbase /usr/local/sbin/ /usr/local/sbin/
COPY --from=containerbase /usr/local/containerbase/ /usr/local/containerbase/
RUN install-containerbase


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.56.0
# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 20.9.0
# renovate: datasource=npm versioning=npm
RUN install-tool yarn 1.22.10

WORKDIR /usr/src/app

# must be numeric if this should work with openshift
USER 12021
```

## Custom user name and id

You can also customize username or userid by using this template.

```dockerfile
# This containerbase is used for tool intallation and user/directory setup
FROM containerbase/base AS containerbase

FROM amd64/ubuntu:noble AS base

# The containerbase supports custom user
ARG USER_NAME=custom
ARG USER_ID=1005
# Allows custom apt proxy usage
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH LANG=C.UTF-8 LC_ALL=C.UTF-8
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

# Optional: Add custom root certificate, should come before `install-containerbase`
COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt

# Set up containerbase
COPY --from=containerbase /usr/local/sbin/ /usr/local/sbin/
COPY --from=containerbase /usr/local/containerbase/ /usr/local/containerbase/
RUN install-containerbase


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.56.0
# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 20.9.0
# renovate: datasource=npm versioning=npm
RUN install-tool yarn 1.22.10

WORKDIR /usr/src/app

# must be numeric if this should work with openshift
USER 1005
```

## Custom primary group id

By default the primary group id is `0` to support OpenShift.
You can change the primary group id by setting `PRIMARY_GROUP_ID` build arg.
This is is required for gitpod, where the primary group id must be `33333`.
The group must already exist.

```dockerfile
# This containerbase is used for tool intallation and user/directory setup
FROM containerbase/base AS containerbase

FROM amd64/ubuntu:noble AS base

ARG USER_NAME=gitpod
ARG USER_ID=33333
ARG PRIMARY_GROUP_ID=33333

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH LANG=C.UTF-8 LC_ALL=C.UTF-8
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

# Set up containerbase
COPY --from=containerbase /usr/local/sbin/ /usr/local/sbin/
COPY --from=containerbase /usr/local/containerbase/ /usr/local/containerbase/
RUN install-containerbase


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.56.0

USER $USER_NAME
```

## Custom temp directory

Containerbase keeps the tool init state and the tool caches in `/tmp/containerbase`.
The home folders link into it, eg. `~/.npm` to `/tmp/containerbase/cache/.npm`.
The `docker-entrypoint.sh` initializes the prepared tools when that folder is missing, or when it is a symlink to a folder which isn't writable.

You can move it with `CONTAINERBASE_TMP_DIR`, eg. to `/var/cache/containerbase`.
The path must be absolute, normalized and outside of `/tmp`, trailing slashes are dropped.
Other values, eg. a relative path, `/`, `/var/../cache` or `/tmp/cache`, are ignored with a warning.
The home links keep pointing to `/tmp/containerbase`, which is then a symlink to the configured folder.
`install-containerbase` always sets up `/tmp/containerbase`, the switch happens on the first `containerbase-cli` prepare, install or init.
`containerbase-cli` checks the value and passes the checked value, or the default, on to the tools it runs.
It creates the symlink when it is missing and replaces a symlink to another folder, the tool wrappers run it when the symlink is missing.
The configured folder may itself be a symlink to a folder.
Shared folders with the sticky bit, eg. `/var/tmp`, are never used.
As root, an existing root owned folder is only given to the configured user when it is dedicated to containerbase: empty, or holding nothing but `tool.init.d`, `cache`, `ipc.sock` or `lost+found`.
Its mode is kept.
As root, the folder must then be writable for the configured user, through its owner, the root group, the user's own group or `PRIMARY_GROUP_ID`, else that run keeps using `/tmp/containerbase`.
Its parent folders must be searchable for the configured user too, eg. not below `/root`, `containerbase-cli` doesn't check them.

Switch the folder at image build time as root.
Only root moves an existing `/tmp/containerbase` folder, eg. from the base image, into the configured folder, entries which already exist there are kept.
For a non-root user with a `/tmp/containerbase` folder, or when the symlink can't be replaced or the configured folder can't be created or written, a warning with the reason is shown and that run keeps using `/tmp/containerbase`.
A symlink at `/tmp/containerbase` to a folder which is missing or not writable is then replaced by a real folder, also when `CONTAINERBASE_TMP_DIR` isn't set.
The folder must always be writable, eg. with a read-only root file system mount a tmpfs on `/tmp` or the configured folder.
When a move has started, including removing the moved folder, and a later step fails, `containerbase-cli` fails instead of falling back.
A file at `/tmp/containerbase` is an error, remove it.

The `docker-entrypoint.sh` only creates a missing symlink and skips `init tool all`, when the configured folder is a valid value, already has a `tool.init.d` folder, is writable and has no sticky bit.
When it runs as root, the folder must also be owned by `USER_ID` with owner write and search permission.
In all other cases it runs `containerbase-cli init tool all`, which handles them as described above.
The ipc socket of `containerbase-cli` is `/tmp/containerbase/ipc.sock`, through the symlink it lives in the configured folder.

Set `CONTAINERBASE_TMP_DIR` before the first tool is prepared or installed, eg. right after `FROM`.

This helps when the rootfs persists but `/tmp` is empty on every boot, eg. in microVMs.
Initialize the tools at image build time, so a boot only needs to create the symlink:

```dockerfile
FROM containerbase/base

ENV CONTAINERBASE_TMP_DIR=/var/cache/containerbase

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 24.22.0

RUN containerbase-cli init tool all
```

When the rootfs isn't reset between jobs, the tool caches and configs (`.npm`, `.m2`, `.npmrc`, …) in that folder carry over to the next job.
Reset the rootfs per job or clean the folder yourself.

## Build-time snapshot

At image build time, `install-tool` and `prepare-tool` keep a snapshot of what they write to `/opt/containerbase` in `/var/lib/containerbase/opt`, at the same paths below it.
This prepares mounting a volume at `/opt/containerbase`, which hides what the image installed there.
The image build is detected from the BuildKit mounts.
Installs at runtime don't add to the snapshot.
Without a volume, a tool writing into its own linked version folder at runtime, eg. a global `npm` or `gem` install, writes through the symlink into the snapshot though, like a `dotnet` sdk installed at runtime, see below.
Installs as the user at image build time are added too, `install-containerbase` creates `/var/lib/containerbase/opt` owned by the user and the root group.
The `COPY --from=containerbase /usr/local/containerbase/ /usr/local/containerbase/` of the samples above doesn't copy the snapshot of the base image.

- The folder an install creates is moved to the snapshot and replaced by a symlink to it, eg. `/opt/containerbase/tools/node/24.22.0` links to `/var/lib/containerbase/opt/tools/node/24.22.0`.
  This also applies to v2 shell tools, and to a version installed earlier whose folder isn't linked yet, when it's installed again.
  Tools installed with npm, pip or gem, eg. `yarn`, keep a real version folder, only the folder of the node, python or ruby version below it is linked.
- `dotnet` installs all sdk versions into `/opt/containerbase/tools/dotnet`, so that whole folder is moved and linked on the first install, later sdk installs write through the symlink.
  So without a volume, sdks installed at runtime are written into the snapshot as well.
  Uninstalling an sdk or a failed sdk install at image build time only removes its `sdk/<version>` folder, the runtimes, packs and templates it brought along stay.
- The `bin`, `lib`, `env.d`, `versions` and `ssl` folders, the `env.sh` of every tool and the database `data/containerbase.db` are copied once per install, also a failed one, uninstall and prepare.
  `/usr/local/bin` and `/usr/local/lib` link to `/opt/containerbase/bin` and `/opt/containerbase/lib`, so files other software puts there are copied too.
  They're only part of the snapshot when a containerbase install or prepare runs after them, and the image stores them twice.
  Only changed files are copied, compared by size and modification time, and copies of removed files are removed, so unchanged files stay in their image layer.
  The database is only copied again when it changed.
  Symlinks are copied as symlinks, the copies keep the mode and, as root, the owner of their source.

The tools keep working through the symlinks, so the absolute paths written at install time stay valid.
Uninstalling a tool version removes the symlink.
At image build time its copy is removed from the snapshot too, at runtime the snapshot is kept.
A failed install at image build time also removes the copy of the version.

The snapshot also holds `.links`, the list of the linked folders, and `.stamp`, a hash of that list and of the copied files.
In `.links`, the folders of tools which write into their install folder at runtime (`flutter`, `dotnet` and `php`) are flagged with `c`, the others with `l`.
A restore copies the flagged folders onto a volume and links the others.
The same stamp is written to `/opt/containerbase/.stamp`, so an image without a volume matches its snapshot.

### Volume at `/opt/containerbase`

You can mount a writable volume at `/opt/containerbase`, also with a read-only root file system, eg. `docker run --read-only --tmpfs /tmp -v containerbase:/opt/containerbase …`.
The volume may start empty or hold the state of an earlier container, also of an older image.

`containerbase-cli init tool all`, which `docker-entrypoint.sh` runs, restores the volume from the snapshot when its `.stamp` is missing or differs from the stamp of the snapshot.
It also restores it when a flagged folder on a writable volume still links to the snapshot, eg. when docker filled a new volume from the image, so the stamps match.
The entrypoint runs it for these reasons too, independent of `/tmp/containerbase`.
`install-tool`, `install-npm`, `install-gem`, `install-pip` and the `uninstall-*` commands restore it implicitly before they open the database.
Their dry runs don't restore it, and don't create a database on a volume which isn't restored yet.
Without a volume, the stamps match and nothing is done, also not when the root file system is read-only.
Images with their own entrypoint must run `containerbase-cli init tool all` before using the tools.
When the restore fails, `init` still initializes the tools and then fails.

The restore:

- removes links to folders of the snapshot which no longer exist, eg. versions an older image had,
- links the folders listed in `.links` which are missing on the volume,
  the flagged folders are copied instead, also replacing a link to the snapshot, so the writes of these tools persist with the volume,
- copies the missing files of the `bin`, `lib`, `env.d`, `versions` and `ssl` folders and the `env.sh` of every tool,
- copies the database `data/containerbase.db` when the volume has none,
- writes the stamp of the snapshot to `/opt/containerbase/.stamp`.

Copies go to a temp path next to their target first and are renamed into place, so an interrupted restore never leaves a half copied folder, file or database, and the next restore redoes it.
Folders and files which exist on the volume are kept, eg. tools installed at runtime, their wrappers and a copied tool folder.
The files the restore copied are recorded in `/opt/containerbase/.restored`, also existing files which equal the snapshot copy, eg. copied by docker into a new volume.
On a later restore, eg. after an image update, such a file is replaced by the new copy, or removed when the snapshot no longer has it, unless it changed on the volume since.
Folders which are empty after removing such files are removed too.
An unreadable `.restored` counts as empty.
As root, the restore gives the created folders, the copied files and the copied tool folders to the user and the root group.
When the current user can't write the volume, it fails before changing anything.
`docker` plugin links in `/tmp/containerbase` aren't restored.
