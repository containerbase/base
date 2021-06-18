#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:20.04@sha256:aba80b77e27148d99c034a987e7da3a287ed455390352663418c0f2ed40417fe

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
