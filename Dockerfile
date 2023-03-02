#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:f6825d78cc6ca720f12878783d387fcbdb61f8219d30a6ba22c7b2ace66a2ed6

ARG APT_HTTP_PROXY

# Weekly cache buster
ARG CACHE_WEEK

ARG BUILDPACK_VERSION

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/base"

#  autoloading containerbase env
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/ubuntu/bin:$PATH
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

COPY src/ /

RUN install-buildpack


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.39.2


LABEL org.opencontainers.image.version="${BUILDPACK_VERSION}"
