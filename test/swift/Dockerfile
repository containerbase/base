#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

COPY src/ /

RUN install-containerbase

COPY --chown=1000:0 test/swift/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# TODO: move to prepare
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.40.0

# renovate: datasource=docker versioning=docker
RUN install-tool swift 5.7.3

#--------------------------------------
# testa: swift latest
#--------------------------------------
FROM build as testa

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
FROM build as testb

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
