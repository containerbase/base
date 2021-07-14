#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:b3e2e47d016c08b3396b5ebe06ab0b711c34e7f37b98c9d37abe794b71cea0a2

ARG APT_HTTP_PROXY

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/buildpack"

#  autoloading buildpack env
ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

COPY src/ /

RUN install-buildpack


# renovate: datasource=github-tags lookupName=git/git
RUN install-tool git v2.32.0
