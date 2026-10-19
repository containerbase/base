# Custom base image

The following sample can be used to create a `containerbase/base` based image which does not extend `containerbase/base` directly.
Currently only ubuntu jammy and noble based amd64 distro are suported.

You can also use our containerbase from GitHub container registry as `ghcr.io/containerbase/base`.
`containerbase/base` and `ghcr.io/containerbase/base` are exchangeble.
You should always use a specific version which can be found at [docker hub](https://hub.docker.com/r/containerbase/base/tags) or at [GitHub container registry](ghcr.io/containerbase/base)

`install-containerbase` installs `jq` from its GitHub releases, like the tools you install afterwards.
If your build can't reach GitHub, use a mirror as described in [custom registries](./custom-registries.md#jq).

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


# renovate: datasource=github-releases packageName=containerbase/git-prebuild
RUN install-tool git 2.56.0
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


# renovate: datasource=github-releases packageName=containerbase/git-prebuild
RUN install-tool git 2.56.0
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


# renovate: datasource=github-releases packageName=containerbase/git-prebuild
RUN install-tool git 2.56.0

USER $USER_NAME
```

## git

`install-tool git` installs git from the containerbase prebuild into `/usr/local/bin`, not from Ubuntu.
To stay compatible with images built on Ubuntu's git, it also:

- installs the apt packages Ubuntu's git pulled in: `git-man`, `perl`, `liberror-perl` and `libcurl3-gnutls` (`libcurl3t64-gnutls` on noble and newer)
- links `git`, `git-receive-pack`, `git-shell`, `git-upload-archive`, `git-upload-pack` and `scalar` into `/usr/bin`, where Ubuntu's git put them, unless a file already exists there

Both go away in the next major release, see [#7821](https://github.com/containerbase/base/issues/7821) and [#7822](https://github.com/containerbase/base/issues/7822).
If your image needs any of these packages, install them yourself, e.g. `install-apt perl git-man libcurl3-gnutls` on jammy or `install-apt perl git-man libcurl3t64-gnutls` on noble and newer.

It also installs an empty `containerbase-git` package, which provides `git` in the installed version to apt.
So apt packages depending on git, like Ubuntu's `git-lfs` or `tig`, use the prebuild and don't pull in Ubuntu's git.
An explicit `install-apt git` and git add-ons like `git-svn` still install Ubuntu's git like before, the containerbase git stays first on the `PATH`.
Blocking Ubuntu's git follows in the next major release, see [#7779](https://github.com/containerbase/base/issues/7779).

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
The configured folder may itself be a symlink to a folder, as root an existing root owned folder is given to the configured user.

Switch the folder at image build time as root.
Only root moves an existing `/tmp/containerbase` folder, eg. from the base image, into the configured folder, entries which already exist there are kept.
For a non-root user with a `/tmp/containerbase` folder, or when the symlink can't be replaced or the configured folder can't be created or written, a warning with the reason is shown and that run keeps using `/tmp/containerbase`.
A symlink at `/tmp/containerbase` to a folder which is missing or not writable is then replaced by a real folder, also when `CONTAINERBASE_TMP_DIR` isn't set.
The folder must always be writable, eg. with a read-only root file system mount a tmpfs on `/tmp` or the configured folder.
When a move has started, including removing the moved folder, and a later step fails, `containerbase-cli` fails instead of falling back.
A file at `/tmp/containerbase` is an error, remove it.

The `docker-entrypoint.sh` only creates a missing symlink and skips `init tool all`, when the configured folder is a valid value, already has a `tool.init.d` folder and is writable.
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
