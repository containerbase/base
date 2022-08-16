#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:af5efa9c28de78b754777af9b4d850112cad01899a5d37d2617bb94dc63a49aa

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
RUN install-tool git v2.37.2


LABEL org.opencontainers.image.version="${BUILDPACK_VERSION}"
