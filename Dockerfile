#--------------------------------------
# Image: base
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04@sha256:fa17826afb526a9fc7250e0fbcbfd18d03fe7a54849472f86879d8bf562c629e

ARG APT_HTTP_PROXY

# Weekly cache buster
ARG CACHE_WEEK

ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_VERSION

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/base"

#  autoloading containerbase env
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/ubuntu/bin:$PATH
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.46.0


LABEL org.opencontainers.image.version="${CONTAINERBASE_VERSION}"
