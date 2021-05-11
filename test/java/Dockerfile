ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 11.0.11

RUN touch /.dummy

WORKDIR /tmp


#--------------------------------------
# test: gradle
#--------------------------------------
FROM build as testa

# renovate: datasource=gradle-version lookupName=gradle versioning=gradle
RUN install-tool gradle 6.9

USER 1000

RUN set -ex; \
  gradle --version;

RUN set -ex; \
  git init .; \
  gradle wrapper; \
  git diff; \
  ./gradlew --version

SHELL [ "/bin/sh", "-c" ]
RUN gradle --version

#--------------------------------------
# test: java 8
#--------------------------------------
FROM build as testb


# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 17

#--------------------------------------
# test: java 16
#--------------------------------------
FROM build as testc


# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 16.0.1

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
