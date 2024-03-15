# Custom base image

The following sample can be used to create a `containerbase/base` based image which does not extend `containerbase/base` directly.
Currently only ubuntu focal and jammy based amd64 distro are suported.

You can also use our containerbase from GitHub container registry as `ghcr.io/containerbase/base`.
`containerbase/base` and `ghcr.io/containerbase/base` are exchangeble.
You should always use a specific version which can be found at [docker hub](https://hub.docker.com/r/containerbase/base/tags) or at [GitHub container registry](ghcr.io/containerbase/base)

## Default user name and id

Use this template for using a custom base image with our default user named `ubuntu` and userid `1000`.

```dockerfile
# This containerbase is used for tool intallation and user/directory setup
FROM containerbase/base AS containerbase

FROM amd64/ubuntu:jammy as base

# Allows custom apt proxy usage
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/ubuntu/bin:$PATH
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
RUN install-tool git v2.30.0
# renovate: datasource=node versioning=node
RUN install-tool node 20.9.0
# renovate: datasource=npm versioning=npm
RUN install-tool yarn 1.22.10

WORKDIR /usr/src/app

# must be numeric if this should work with openshift
USER 1000
```

## Custom user name and id

You can also customize username or userid by using this template.

```dockerfile
# This containerbase is used for tool intallation and user/directory setup
FROM containerbase/base AS containerbase

FROM amd64/ubuntu:jammy as base

# The containerbase supports custom user
ARG USER_NAME=custom
ARG USER_ID=1005
# Allows custom apt proxy usage
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH
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
RUN install-tool git v2.30.0
# renovate: datasource=node versioning=node
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

FROM amd64/ubuntu:jammy as base

ARG USER_NAME=gitpod
ARG USER_ID=33333
ARG PRIMARY_GROUP_ID=33333

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

# Set up containerbase
COPY --from=containerbase /usr/local/sbin/ /usr/local/sbin/
COPY --from=containerbase /usr/local/containerbase/ /usr/local/containerbase/
RUN install-containerbase


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.30.0

USER $USER_NAME
```
