ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:24.04 AS containerbase

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

# Used for tests
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

COPY --chown=12021:0 test/java/test test
WORKDIR /test

#--------------------------------------
# build: Java LTS base
#--------------------------------------
FROM base AS build

RUN prepare-tool java

RUN set -ex; \
  ls -la $USER_HOME; \
  [ $(stat --format '%a' "${USER_HOME}/.gradle") -eq 777 ]; \
  [ $(stat --format '%a' "${USER_HOME}/.m2") -eq 777 ]; \
  true

RUN set -ex; \
  ls -la /tmp; \
  find /tmp -mindepth 1 -maxdepth 1; \
  true

RUN [ "$(find /tmp -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ]

# renovate: datasource=java-version packageName=java-jre
RUN install-tool java 21.0.5+11.0.LTS

RUN set -ex; \
  ls -la /tmp; \
  true


RUN [ "$(find /tmp -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ]

#--------------------------------------
# test: Java 11 LTS + Gradle 6
#--------------------------------------
FROM build AS test-gradle-a

RUN install-tool java 11.0.23+9

RUN prepare-tool gradle

USER 12021

# stay on v6
RUN install-tool gradle 6.9
# disable renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 6.9.4


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
# test: Java 21 LTS + Gradle 8
#--------------------------------------
FROM base AS test-gradle-b

# renovate: datasource=java-version packageName=java-jre
RUN install-tool java-jre 21.0.5+11.0.LTS

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 8.10.2

USER 12021

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
# test: Java 8 LTS + Gradle 7
#--------------------------------------
FROM build AS test-gradle-c

# need to stay old
RUN install-tool java 8.0.342+7

# disable renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.6.1

RUN set -ex; \
  ls -la /root/; \
  ls -la /opt/containerbase/; \
  ls -la /tmp/containerbase/cache/; \
  ls -la /tmp/containerbase/cache/.gradle; \
  true

# test openshift userid missmatch
USER 1001

RUN gradle --version

#--------------------------------------
# test: Java 17 LTS (non-root)
#--------------------------------------
FROM base AS test-gradle-d

RUN prepare-tool java gradle

# test openshift userid missmatch
USER 1001

# renovate: datasource=java-version depName=java
ARG JAVA_JDK_VERSION=21.0.5+11.0.LTS
RUN install-tool java-jdk

# test latest gradle
RUN install-tool gradle latest

RUN gradle --version

# fail if java version mismatch
RUN gradle --version | grep "${JAVA_VERSION}"

#--------------------------------------
# test: maven
#--------------------------------------
FROM build AS test-maven-a

# test openshift userid missmatch
USER 1001

# test archive.apache.org
RUN install-tool maven 3.1.0-alpha-1

RUN install-tool maven 3.5.4

# renovate: datasource=maven packageName=org.apache.maven:maven
RUN install-tool maven 3.9.9

RUN set -ex; \
  mkdir -p /tmp/mvn && cd /tmp/mvn; \
  mvn archetype:generate -DgroupId=com.mycompany.app -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DarchetypeVersion=1.4 -DinteractiveMode=false;


#--------------------------------------
# test: Scala / sbt
#--------------------------------------
FROM build AS test-others


WORKDIR /

# not required / used for sbt
# renovate: datasource=github-releases packageName=scala/scala
RUN install-tool scala v2.13.15

# renovate: datasource=github-releases packageName=sbt/sbt
RUN install-tool sbt v1.10.4

RUN install-tool gradle 8.8-rc-2

# doesn't work for arbitrary users
USER 12021

WORKDIR /test
RUN set -ex; \
  cd sbt; \
  ls -la; env; \
  sbt compile


#--------------------------------------
# test: Resolve latest versions
#--------------------------------------
FROM base AS test-latest-version

RUN install-tool java-jre
RUN install-tool gradle
RUN install-tool maven


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-gradle-a /.dummy /.dummy
COPY --from=test-gradle-b /.dummy /.dummy
COPY --from=test-gradle-c /.dummy /.dummy
COPY --from=test-gradle-d /.dummy /.dummy
COPY --from=test-maven-a /.dummy /.dummy
COPY --from=test-others /.dummy /.dummy
COPY --from=test-latest-version /.dummy /.dummy
