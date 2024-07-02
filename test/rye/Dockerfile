#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

COPY --chown=1000:0 test/rye/test test
WORKDIR /test

RUN prepare-tool rye

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# renovate: datasource=github-releases packageName=astral-sh/rye
RUN install-tool rye 0.34.0

USER 1000

#--------------------------------------
# test a1: root
#--------------------------------------
FROM build as test-a1

RUN set -ex; \
    cd a; \
    rye sync;

SHELL [ "/bin/sh", "-c" ]
RUN rye --version
RUN rye run python --version

#--------------------------------------
# test a2: non-root
#--------------------------------------
FROM base as test-a2

USER 1000

# renovate: datasource=github-releases packageName=astral-sh/rye
RUN install-tool rye 0.34.0

RUN set -ex; \
  cd a; \
  rye sync;

SHELL [ "/bin/sh", "-c" ]
RUN rye --version
RUN rye run python --version

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-a1 /.dummy /.dummy
COPY --from=test-a2 /.dummy /.dummy
