#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:a283507f25d2cd01d60594bb6e7dcae568e3248b359fe39461ffbd80327b6cdf

ARG APT_HTTP_PROXY

# Weekly cache buster
ARG CACHE_WEEK

ARG CONTAINERBASE_VERSION

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/base"

#  autoloading containerbase env
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/ubuntu/bin:$PATH
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

COPY src/ /

RUN install-containerbase


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.41.0


LABEL org.opencontainers.image.version="${CONTAINERBASE_VERSION}"
