ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

ARG APT_HTTP_PROXY

# Do not renovate ruby 2.x
RUN install-tool ruby 2.6.4

RUN touch /.dummy

WORKDIR /tmp

COPY --chown=1000:0 test test

FROM ${IMAGE} as build3

ARG APT_HTTP_PROXY

# renovate: datasource=github-releases lookupName=containerbase/ruby-prebuild versioning=ruby
RUN install-tool ruby 3.0.2

RUN touch /.dummy

WORKDIR /tmp

COPY --chown=1000:0 test test

#--------------------------------------
# test: bundler
#--------------------------------------
FROM build as testa

USER 1000

RUN ruby --version

RUN gem install bundler -v 1.17.2

RUN set -ex; \
  [ "$(command -v bundle)" = "/home/${USER_NAME}/.gem-global/bin/bundle" ] && echo "works" || exit 1; \
  bundler env

ENV GEM_HOME=/tmp/.gem

RUN gem install bundler -v 1.17.2

RUN set -ex; \
  [ "$(command -v bundle)" = "/tmp/.gem/bin/bundle" ] && echo "works" || exit 1; \
  bundler env

RUN set -ex; \
    cd test/a; \
    bundle lock

#--------------------------------------
# test: global bundler
#--------------------------------------
FROM build as testb

# renovate: datasource=rubygems versioning=ruby
RUN install-gem bundler 2.2.27

USER 1000

RUN ruby --version
RUN bundler env

RUN set -ex; \
    cd test/a; \
    bundle lock;

SHELL [ "/bin/sh", "-c" ]
RUN ruby --version

#--------------------------------------
# test: cocoapods
#--------------------------------------
FROM build as testc

USER 1000

RUN gem install cocoapods -v 1.9.1

RUN set -ex; \
    cd test/b/Project; \
    gem install cocoapods-acknowledgements; \
    pod install;

#--------------------------------------
# test: global cocoapods
#--------------------------------------
FROM build3 as testd

# renovate: datasource=rubygems versioning=ruby
RUN install-gem cocoapods 1.11.1

USER 1000

RUN set -ex; \
    cd test/b/Project; \
    gem install cocoapods-acknowledgements; \
    pod install;



#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
