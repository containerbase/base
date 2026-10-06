ARG BASE_IMAGE=containerbase/test

#--------------------------------------
# Image used by `test.sh` to run with a read-only root file system
#--------------------------------------
FROM ${BASE_IMAGE}

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

# prepared tool, its init links the user caches to `/tmp`
RUN prepare-tool node

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 24.21.0

# tool without a prepare step
# renovate: datasource=github-releases packageName=fluxcd/flux2
RUN install-tool flux v2.9.6
