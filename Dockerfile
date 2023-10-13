#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:0b5642e51a93c43da14d8c0322b43739abaa1ddd8b15f2c811175e42b6340d72

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
RUN install-tool git v2.42.0


LABEL org.opencontainers.image.version="${CONTAINERBASE_VERSION}"
