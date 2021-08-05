ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

ARG APT_HTTP_PROXY

# TODO: only lts
# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 11.0.12

RUN touch /.dummy

WORKDIR /tmp

COPY --chown=1000:0 test test

#--------------------------------------
# test: gradle 6
#--------------------------------------
FROM build as testa

USER 1000

RUN install-tool gradle 6.9


RUN set -ex; \
  gradle --version;

RUN set -ex; \
  git init .; \
  touch settings.gradle; \
  gradle wrapper; \
  git diff; \
  ./gradlew --version

RUN gradle --version

#--------------------------------------
# test: gradle 7
#--------------------------------------
FROM build as testb

# renovate: datasource=gradle-version lookupName=gradle versioning=gradle
RUN install-tool gradle 7.1.1

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
RUN install-tool java 16.0.2

#--------------------------------------
# test: maven
#--------------------------------------
FROM build as teste

# renovate: datasource=maven lookupName=org.apache.maven:maven
RUN install-tool maven 3.8.1

# test openshift userid missmatch
USER 1001

RUN set -ex; \
  mvn archetype:generate -DgroupId=com.mycompany.app -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DarchetypeVersion=1.4 -DinteractiveMode=false;

RUN set -ex; env; ls -la $MAVEN_CONFIG; id -u; id -g;

#--------------------------------------
# test: scala / sbt
#--------------------------------------
FROM build as testf

# not required / used for sbt
# renovate: datasource=github-releases lookupName=scala/scala
RUN install-tool scala v2.13.6

# renovate: datasource=github-releases lookupName=sbt/sbt
RUN install-tool sbt v1.5.5

# doesn't work for arbitrary users
USER 1000

RUN set -ex; \
  cd test/sbt; \
  ls -la; env; \
  sbt compile

RUN ls -la ~

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
