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

# TODO: move to prepare for bundler and cocoapods
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.41.0

COPY --chown=1000:0 test/ruby/test test
WORKDIR /test

#--------------------------------------
# build: ruby 2.x
#--------------------------------------
FROM base as build

# Do not renovate ruby 2.x
RUN install-tool ruby 2.6.4

#--------------------------------------
# build3: ruby 3.x
#--------------------------------------
FROM base as build3

# renovate: datasource=github-releases packageName=containerbase/ruby-prebuild versioning=ruby
RUN install-tool ruby 3.2.2


#--------------------------------------
# test: bundler (gem)
#--------------------------------------
FROM build as test-bundler-a

ENV PATH=/home/ubuntu/bin:$PATH

# openshift
USER 1005

RUN ruby --version
RUN gem env

RUN gem install bundler -v 1.17.2

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

RUN gem install bundler -v 1.17.2

# renovate: datasource=rubygems versioning=ruby
RUN install-tool bundler 2.4.18

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

# do not change, testing only
ENV BUNDLER_VERSION=1.17.3
RUN install-tool bundler


RUN set -ex; \
  bundler --version | grep ${BUNDLER_VERSION}; \
  [ "$(command -v bundler)" = "/usr/local/bin/bundler" ] && echo "works" || exit 1; \
  true

RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/bundler") -eq 1000 ]

USER 1000


# renovate: datasource=rubygems depName=bundler versioning=ruby
ENV BUNDLER_VERSION=2.4.18
RUN install-tool bundler

RUN set -ex; \
  bundler --version | grep ${BUNDLER_VERSION}; \
  [ "$(command -v bundler)" = "/usr/local/bin/bundler" ] && echo "works" || exit 1; \
  true

RUN bundler env

RUN set -ex; \
  cd a; \
  bundler lock;

#--------------------------------------
# test: bundler install root - install rootless
#--------------------------------------
FROM build3 as test-bundler-d

# renovate: datasource=rubygems depName=bundler versioning=ruby
ENV BUNDLER_VERSION=2.4.18
RUN install-tool bundler

RUN set -ex; ls -la /usr/local/bin/; [ $(stat --format '%u' "/usr/local/bin/bundler") -eq 1000 ]

USER 1000

# install old version
RUN install-tool ruby 3.1.0

# renovate: datasource=rubygems depName=bundler versioning=ruby
ENV BUNDLER_VERSION=2.4.18
RUN install-tool bundler

#--------------------------------------
# test: cocoapods
#--------------------------------------
FROM build as test-cocoapods-a

ENV PATH=/home/ubuntu/bin:$PATH

USER 1000

RUN gem install cocoapods -v 1.9.1

RUN set -ex; \
  cd b/Project; \
  gem install cocoapods-acknowledgements; \
  pod install;

#--------------------------------------
# test: unused
#--------------------------------------
FROM build3 as test-cocoapods-b

# unused


#--------------------------------------
# test: cocoapods (install-tool)
#--------------------------------------
FROM build3 as test-cocoapods-c

USER 1000

# renovate: datasource=rubygems versioning=ruby
RUN install-tool cocoapods 1.12.1

RUN pod env

RUN set -ex; \
  cd b/Project; \
  gem install cocoapods-acknowledgements; \
  pod install;

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-bundler-a /.dummy /.dummy
COPY --from=test-bundler-b /.dummy /.dummy
COPY --from=test-bundler-c /.dummy /.dummy
COPY --from=test-bundler-d /.dummy /.dummy
COPY --from=test-cocoapods-a /.dummy /.dummy
# COPY --from=test-cocoapods-b /.dummy /.dummy
COPY --from=test-cocoapods-c /.dummy /.dummy
