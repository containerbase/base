# Custom base image

The following sample can be used to create a `containerbase/buildpack` based image which does not extend `containerbase/buildpack` directly.

```dockerfile
# This buildpack is used for tool intallation and user/directory setup
FROM containerbase/buildpack AS buildpack

# currently only ubuntu focal based distro suported
FROM ubuntu:focal as base

# The buildpack supports custom user
ARG USER_NAME=user
ARG USER_ID=1000
ARG APP_ROOT=/usr/src/app

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env HOME=/home/$USER_NAME PATH=/home/$USER_NAME/bin:$PATH
SHELL ["/bin/bash" , "-c"]

# This entry point ensures that dumb-init is run
ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "bash" ]

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

WORKDIR ${APP_ROOT}

USER $USER_ID
```
