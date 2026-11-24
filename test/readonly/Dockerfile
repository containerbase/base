ARG BASE_IMAGE=containerbase/test

#--------------------------------------
# Image used by `test.sh` to run with a read-only root file system
#--------------------------------------
FROM ${BASE_IMAGE}

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_CDN_GEM
ARG CONTAINERBASE_CDN_NPM
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

# prepared tool, its init links the user caches to `/tmp`
RUN prepare-tool node

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 26.13.1

# tool without a prepare step
# renovate: datasource=github-releases packageName=fluxcd/flux2
RUN install-tool flux v2.10.1

# tools the volume tests install again on first use, jq at once
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.56.1

# renovate: datasource=github-releases packageName=jqlang/jq
RUN install-tool jq 1.8.2

# renovate: datasource=java-version packageName=java-jre?os=linux&architecture=x64
RUN install-tool java-jre 25.0.5+8.0.LTS

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.14.10

# renovate: datasource=pypi
RUN install-pip hashin 1.0.5

# tool whose version folder is gone, only its shim and the dangling pointer are left
# don't update!!
RUN install-tool helm v3.7.0
RUN set -ex; \
  rm -rf /opt/containerbase/tools/helm/*; \
  [[ -L /opt/containerbase/links/helm && ! -e /opt/containerbase/links/helm ]]
