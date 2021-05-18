ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

ARG APT_HTTP_PROXY

# TODO: only lts
# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 11.0.11

RUN touch /.dummy

WORKDIR /tmp


#--------------------------------------
# test: gradle 6
#--------------------------------------
FROM build as testa

# renovate: datasource=gradle-version lookupName=gradle versioning=gradle
RUN install-tool gradle 6.9

USER 1000

RUN set -ex; \
  gradle --version;

RUN set -ex; \
  git init .; \
  touch settings.gradle; \
  gradle wrapper; \
  git diff; \
  ./gradlew --version

SHELL [ "/bin/sh", "-c" ]
RUN gradle --version

#--------------------------------------
# test: gradle 7
#--------------------------------------
FROM build as testb

# renovate: datasource=gradle-version lookupName=gradle versioning=gradle
RUN install-tool gradle 7.0.2

USER 1000

RUN set -ex; \
  gradle --version;

RUN set -ex; \
  git init .; \
  touch settings.gradle; \
  gradle wrapper; \
  git diff; \
  ./gradlew --version

SHELL [ "/bin/sh", "-c" ]
RUN gradle --version

#--------------------------------------
# test: java 8
#--------------------------------------
FROM build as testc

ARG APT_HTTP_PROXY

# need to stay old
RUN install-tool java 8

#--------------------------------------
# test: java 16
#--------------------------------------
FROM build as testd

ARG APT_HTTP_PROXY

# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 16.0.1

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
