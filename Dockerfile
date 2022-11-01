#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:450e066588f42ebe1551f3b1a535034b6aa46cd936fe7f2c6b0d72997ec61dbd

ARG APT_HTTP_PROXY

# Weekly cache buster
ARG CACHE_WEEK

ARG BUILDPACK_VERSION

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/buildpack"

#  autoloading buildpack env
ENV BASH_ENV=/usr/local/etc/env ENV=/usr/local/etc/env PATH=/home/ubuntu/bin:$PATH
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

COPY src/ /

RUN install-buildpack


# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.38.1


LABEL org.opencontainers.image.version="${BUILDPACK_VERSION}"
