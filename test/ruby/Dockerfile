ARG IMAGE=containerbase/buildpack
ARG BUILDPACK_DEBUG

FROM ${IMAGE} as build

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# Do not renovate ruby 2.x
RUN install-tool ruby 2.6.4

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

FROM ${IMAGE} as build3

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# renovate: datasource=github-releases lookupName=containerbase/ruby-prebuild versioning=ruby
RUN install-tool ruby 3.1.0

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# test: bundler (gem)
#--------------------------------------
FROM build as test-bundler-a

ARG BUILDPACK_DEBUG

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

ARG BUILDPACK_DEBUG

# renovate: datasource=rubygems versioning=ruby
RUN install-gem bundler 2.3.5

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

ARG BUILDPACK_DEBUG
USER 1000

# renovate: datasource=rubygems versioning=ruby
RUN install-tool bundler 2.3.5

RUN ruby --version
RUN bundler env

RUN set -ex; \
    cd a; \
    bundler lock;


#--------------------------------------
# test: cocoapods
#--------------------------------------
FROM build as test-cocoapods-a

ARG BUILDPACK_DEBUG

USER 1000

RUN gem install cocoapods -v 1.9.1

RUN set -ex; \
    cd b/Project; \
    gem install cocoapods-acknowledgements; \
    pod install;

#--------------------------------------
# test: global cocoapods (install-gem)
#--------------------------------------
FROM build3 as test-cocoapods-b

ARG BUILDPACK_DEBUG

# renovate: datasource=rubygems versioning=ruby
RUN install-gem cocoapods 1.11.2

USER 1000

RUN set -ex; \
    cd b/Project; \
    gem install cocoapods-acknowledgements; \
    pod install;


#--------------------------------------
# test: cocoapods (install-tool)
#--------------------------------------
FROM build3 as test-cocoapods-c

ARG BUILDPACK_DEBUG

USER 1000

# renovate: datasource=rubygems versioning=ruby
RUN install-tool cocoapods 1.11.2

RUN pod env

RUN set -ex; \
    cd b/Project; \
    gem install cocoapods-acknowledgements; \
    pod install;

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=test-bundler-a /.dummy /.dummy
COPY --from=test-bundler-b /.dummy /.dummy
COPY --from=test-bundler-c /.dummy /.dummy
COPY --from=test-cocoapods-a /.dummy /.dummy
COPY --from=test-cocoapods-b /.dummy /.dummy
COPY --from=test-cocoapods-c /.dummy /.dummy
