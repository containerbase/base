#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:35ab2bf57814e9ff49e365efd5a5935b6915eede5c7f8581e9e1b85e0eecbe16

ARG APT_HTTP_PROXY

# Weekly cache buster
ARG CACHE_WEEK

ARG BUILDPACK_VERSION

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/buildpack"

#  autoloading buildpack env
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/user/bin:$PATH
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

COPY src/ /

RUN install-buildpack


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.38.0


LABEL org.opencontainers.image.version="${BUILDPACK_VERSION}"
