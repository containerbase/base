# Custom base image

The following sample can be used to create a `containerbase/buildpack` based image which does not extend `containerbase/buildpack` directly.
Currently only ubuntu focal and bionic based amd64 distro is suported.

You can also use our buildpack from GitHub container registry as `ghcr.io/containerbase/buildpack`.
`containerbase/buildpack` and `ghcr.io/containerbase/buildpack` are exchangeble.
You should always use a specific version which can be found at [docker hub](https://hub.docker.com/r/containerbase/buildpack/tags) or at [GitHub container registry](ghcr.io/containerbase/buildpack)

## Default user name and id

Use this template for using a custom base image with our default user named `user` and userid `1000`.

```dockerfile
# This buildpack is used for tool intallation and user/directory setup
FROM containerbase/buildpack AS buildpack

FROM amd64/ubuntu:focal as base

# Allows custom apt proxy usage
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

# Optional: Add custom root certificate, should come before `install-buildpack`
COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt

# Set up buildpack
COPY --from=buildpack /usr/local/bin/ /usr/local/bin/
COPY --from=buildpack /usr/local/buildpack/ /usr/local/buildpack/
RUN install-buildpack


# renovate: datasource=github-tags lookupName=git/git
RUN install-tool git v2.30.0
# renovate: datasource=docker versioning=docker
RUN install-tool node 14.15.4
# renovate: datasource=npm versioning=npm
RUN install-tool yarn 1.22.10

WORKDIR /usr/src/app

# must be numeric if this should work with openshift
USER 1000
```

## Custom user name and id

You can also customize username or userid by using this template.

```dockerfile
# This buildpack is used for tool intallation and user/directory setup
FROM containerbase/buildpack AS buildpack

FROM amd64/ubuntu:focal as base

# The buildpack supports custom user
ARG USER_NAME=custom
ARG USER_ID=1005
# Allows custom apt proxy usage
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

# Optional: Add custom root certificate, should come before `install-buildpack`
COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt

# Set up buildpack
COPY --from=buildpack /usr/local/bin/ /usr/local/bin/
COPY --from=buildpack /usr/local/buildpack/ /usr/local/buildpack/
RUN install-buildpack


# renovate: datasource=github-tags lookupName=git/git
RUN install-tool git v2.30.0
# renovate: datasource=docker versioning=docker
RUN install-tool node 14.15.4
# renovate: datasource=npm versioning=npm
RUN install-tool yarn 1.22.10

WORKDIR /usr/src/app

# must be numeric if this should work with openshift
USER 1005
```
