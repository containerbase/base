#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

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

# TODO: move to prepare for bundler and cocoapods
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.45.2

COPY --chown=1000:0 test/ruby/test test
WORKDIR /test

#--------------------------------------
# build: ruby 3.x
#--------------------------------------
FROM base as build

# renovate: datasource=github-releases packageName=containerbase/ruby-prebuild
RUN install-tool ruby 3.3.2

#--------------------------------------
# test: bundler (gem)
#--------------------------------------
FROM build as test-bundler-a

ENV PATH=/home/ubuntu/bin:$PATH

# fix perms
RUN chown -R 1005:0 /test

# openshift
USER 1005

RUN ruby --version
RUN gem env

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.11
RUN gem install bundler -v $BUNDLER_VERSION

RUN bundle env

RUN set -ex; \
  [ "$(command -v bundle)" = "/home/${USER_NAME}/bin/bundle" ] && echo "works" || exit 1; \
  bundler env

RUN set -ex; \
  cd a; \
  bundler lock

#--------------------------------------
# test: global bundler
#--------------------------------------
FROM build as test-bundler-b

# renovate: datasource=rubygems depName=bundler
RUN install-tool bundler 2.4.22

USER 1000

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
FROM build as test-bundler-c


USER 1000

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.11
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

#--------------------------------------
# test: bundler install root - install rootless
#--------------------------------------
FROM build as test-bundler-d

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.11
RUN install-tool bundler

RUN set -ex; ls -la /usr/local/bin/; [ $(stat --format '%u' "/usr/local/bin/bundler") -eq 1000 ]

USER 1000

# install old version
RUN install-tool ruby 3.1.0

# renovate: datasource=rubygems depName=bundler
ENV BUNDLER_VERSION=2.5.11
RUN install-tool bundler


#--------------------------------------
# test: cocoapods (install-tool)
#--------------------------------------
FROM build as test-cocoapods-a

USER 1000

# renovate: datasource=rubygems
RUN install-tool cocoapods 1.15.2

RUN pod env

RUN set -ex; \
  cd b/Project; \
  pod install;

#--------------------------------------
# test: install-gem
#--------------------------------------
FROM build as test-gem

USER 1000

# renovate: datasource=rubygems
RUN install-gem rake 13.2.1

RUN rake --help


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-bundler-a /.dummy /.dummy
COPY --from=test-bundler-b /.dummy /.dummy
COPY --from=test-bundler-c /.dummy /.dummy
COPY --from=test-bundler-d /.dummy /.dummy
COPY --from=test-cocoapods-a /.dummy /.dummy
COPY --from=test-gem /.dummy /.dummy
