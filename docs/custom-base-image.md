# Custom base image

The following sample can be used to create a `containerbase/base` based image which does not extend `containerbase/base` directly.
Currently only ubuntu jammy and noble based amd64 distro are suported.

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

## Volume at `/opt/containerbase`

You can mount a volume at `/opt/containerbase`, eg. to run a read-only root file system with a writable `/opt/containerbase`, or to keep tools between runs.
The tools you installed at image build time as root are recorded in `/var/lib/containerbase/tool.inst`, a plain text list which is part of the image, and in a copy at `/opt/containerbase/.tool.inst`.
The list is only written for BuildKit builds, as containerbase detects a build by its BuildKit mounts.
An image built with kaniko, buildah or podman has no list, so its own tools are lost on an empty volume.

### Empty volume

An empty volume hides the tools of the image.
The `docker-entrypoint.sh` runs `containerbase-cli init tool all`, which compares the list of the image with the copy on the volume.
When they differ, which is the case for a new volume and after an image update, it sets up the volume from the list:

- it creates the folders, the database records, the shims in `bin` and the current versions
- the versions of the image win over the ones installed at runtime
- it installs `jq` at once, as the shell utils need it, `git` comes with the image
- it copies the list to the volume, so the next start has nothing to do
- it never removes anything: versions of an older image stay on the volume until you remove them with `uninstall-tool` or `containerbase-cli cleanup`

All other tools are installed on their first call, see [how tools are linked](./linking.md#containerbase-cli-ensure).
The first call of each tool downloads it, so a volume needs network access and doesn't work in an air-gapped setup.
Tools which are installed again download their dependencies again, eg. npm and pip packages, and elixir fetches hex and rebar.
A tool you use by its path or by an environment variable, eg. `JAVA_HOME`, without calling its command first, is missing until its command or `install-tool` installed it.
`docker buildx` and `docker compose` go through the shims of `buildx` and `docker-compose`, so the first call installs them.
Docker commands which list the plugins, eg. `docker info` and `docker help`, run every plugin and so install buildx and compose too.

Not part of the list, and so lost on a volume:

- the v2 shell tools, as the shims can't install them again, install them again at runtime
- files other software put into `/usr/local/bin` or `/usr/local/lib`, as these link to `/opt/containerbase/bin` and `/opt/containerbase/lib`, use `/usr/local/sbin` or `/usr/bin` instead
- a custom Java `cacerts` copied to `/opt/containerbase/ssl/cacerts`, mount it at runtime instead, see [custom root CA certificates](./custom-root-ca.md#runtime-java-install)
- the `env.d` files of custom v2 tools

In a multi-stage build, copy `/opt/containerbase` and `/var/lib/containerbase` from the same stage.
Copying only `/opt/containerbase` from a builder stage gives a list which differs from its `.tool.inst`, so the setup runs on every start and the current versions of the base image replace the ones of the builder.

A custom entrypoint must run `containerbase-cli init tool all`.
The `docker-entrypoint.sh` does it when `/tmp/containerbase` is missing, or when the volume has another list than the image.

### Copy of the image folder

A copy of `/opt/containerbase` of the image, eg. made with `cp -a` in an init container as root or as the containerbase user, is supported too.
The copy has the list of the image, so the init has nothing to do and no tool is downloaded.

### Disk instead of memory

Back the volume with a disk, eg. a disk-backed `emptyDir`, not with memory: the tools need a few hundred megabytes up to some gigabytes.
