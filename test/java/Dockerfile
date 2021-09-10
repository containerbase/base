ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

RUN touch /.dummy

WORKDIR /tmp

COPY --chown=1000:0 test test

#--------------------------------------
# build: Java LTS base
#--------------------------------------
FROM base as build

ARG APT_HTTP_PROXY

# TODO: only lts
# renovate: datasource=adoptium-java lookupName=java-jre
RUN install-tool java 11.0.12+7

#--------------------------------------
# test: gradle 6
#--------------------------------------
FROM build as testa

USER 1000

# stay on v6
# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 6.9.1


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
FROM base as testb

# renovate: datasource=adoptium-java lookupName=java-jre
RUN install-tool java-jre 11.0.12+7

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.2

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
# renovate: datasource=adoptium-java lookupName=java-jre
RUN install-tool java 11.0.12+7

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.2

#--------------------------------------
# test: java 16 (non-root)
#--------------------------------------
FROM base as testd

ARG APT_HTTP_PROXY

USER 1000

# renovate: datasource=adoptium-java depName=java
ARG JAVA_VERSION=16.0.2+7
RUN install-tool java

# test latest gradle
RUN install-tool gradle latest

RUN gradle --version

# fail if java version mismatch
RUN gradle --version | grep "${JAVA_VERSION}"

#--------------------------------------
# test: maven
#--------------------------------------
FROM build as teste

# renovate: datasource=maven lookupName=org.apache.maven:maven
RUN install-tool maven 3.8.2

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
