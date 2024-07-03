#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

COPY --chown=1000:0 test/swift/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

# TODO: move to prepare
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.45.2

# renovate: datasource=docker versioning=docker
RUN install-tool swift 5.10.1

#--------------------------------------
# testa: swift latest
#--------------------------------------
FROM build AS testa

USER 1000

RUN swift --version

RUN set -ex; \
  cd a; \
  swift package resolve

RUN set -ex; \
  cd b; \
  swift package resolve

RUN set -ex; \
  cd c; \
  swift package resolve

SHELL [ "/bin/sh", "-c" ]
RUN swift --version


#--------------------------------------
# testb: swift 5.2.5 (non-root)
#--------------------------------------
FROM build AS testb

USER 1000

RUN install-tool swift 5.2.5

RUN set -ex; swift --version | grep 5.2.5

RUN set -ex; \
  cd c; \
  swift package resolve

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
