ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04 AS containerbase

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH
COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

RUN install-containerbase

# TODO: move to prepare for bundler and cocoapods
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.47.0

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

COPY --chown=12021:0 test/ruby/test test
WORKDIR /test

#--------------------------------------
# build: ruby 3.x
#--------------------------------------
FROM base AS build

# renovate: datasource=github-releases packageName=containerbase/ruby-prebuild
RUN install-tool ruby 3.3.5

#--------------------------------------
# test: global bundler
#--------------------------------------
FROM build AS test-bundler-b

# renovate: datasource=rubygems depName=bundler
RUN install-tool bundler 2.4.22

USER 12021

RUN ruby --version
RUN bundler env

RUN set -ex; \
  cd a; \
  bundler lock;

SHELL [ "/bin/sh", "-c" ]
RUN ruby --version

#--------------------------------------
# test: bundler (install-tool)
#--------------------------------------
FROM build AS test-bundler-c

USER 12021

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.21
RUN install-tool bundler

RUN set -ex; \
  bundler --version | grep ${BUNDLER_VERSION}; \
  [ "$(command -v bundler)" = "/usr/local/bin/bundler" ] && echo "works" || exit 1; \
  [ "$(command -v bundle)" = "/usr/local/bin/bundle" ] && echo "works" || exit 1; \
  true

RUN bundler env

RUN set -ex; \
  cd a; \
  bundler lock;

RUN set -ex; \
ls -la $USER_HOME; \
ls -la $USER_HOME/.gem/; \
true

#--------------------------------------
# test: bundler install root - install rootless
#--------------------------------------
FROM build AS test-bundler-d

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.21
RUN install-tool bundler

RUN set -ex; ls -la /usr/local/bin/; [ $(stat --format '%u' "/usr/local/bin/bundler") -eq 12021 ]

USER 12021

# install old version
RUN install-tool ruby 3.1.0

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.21
RUN install-tool bundler


#--------------------------------------
# test: cocoapods (install-tool)
#--------------------------------------
FROM build AS test-cocoapods-a

USER 12021

# renovate: datasource=rubygems
RUN install-tool cocoapods 1.15.2

RUN pod env

RUN set -ex; \
  cd b/Project; \
  pod install;

RUN set -ex; \
  ls -la $USER_HOME; \
  ls -la $USER_HOME/.gem/; \
  ls -la $USER_HOME/.cocoapods/; \
  ls -la $USER_HOME/Library/; \
  true

#--------------------------------------
# test: install-gem, no version
#--------------------------------------
FROM build AS test-gem

USER 12021

RUN install-tool cocoapods

RUN install-gem rake

RUN rake --version


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-bundler-b /.dummy /.dummy
COPY --from=test-bundler-c /.dummy /.dummy
COPY --from=test-bundler-d /.dummy /.dummy
COPY --from=test-cocoapods-a /.dummy /.dummy
COPY --from=test-gem /.dummy /.dummy
