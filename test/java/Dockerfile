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

# Used for tests
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.45.2

COPY --chown=1000:0 test/java/test test
WORKDIR /test

#--------------------------------------
# build: Java LTS base
#--------------------------------------
FROM base as build

RUN prepare-tool java

RUN set -ex; \
  ls -la $USER_HOME; \
  [ $(stat --format '%a' "${USER_HOME}/.gradle") -eq 777 ]; \
  [ $(stat --format '%a' "${USER_HOME}/.m2") -eq 777 ]; \
  true

RUN [ "$(find /tmp -type f | wc -l)" -eq 0 ]

RUN set -ex; \
  ls -la /tmp; \
  find /tmp -type f; \
  exit 0

# renovate: datasource=java-version packageName=java-jre
RUN install-tool java 21.0.3+9.0.LTS

RUN set -ex; \
  ls -la /tmp; \
  find /tmp -type f; \
  exit 0


RUN [ "$(find /tmp -type f | wc -l)" -eq 0 ]

#--------------------------------------
# test: Java 11 LTS + Gradle 6
#--------------------------------------
FROM build as test-gradle-a

RUN install-tool java 11.0.23+9

RUN prepare-tool gradle

USER 1000

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
FROM base as test-gradle-b

# renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java-jre 21.0.3+9.0.LTS

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 8.8

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
# test: Java 8 LTS + Gradle 7
#--------------------------------------
FROM build as test-gradle-c

# need to stay old
RUN install-tool java 8.0.342+7

# disable renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.6.1

# test openshift userid missmatch
USER 1001

RUN gradle --version

#--------------------------------------
# test: Java 17 LTS (non-root)
#--------------------------------------
FROM base as test-gradle-d

RUN prepare-tool java gradle

# test openshift userid missmatch
USER 1001

# renovate: datasource=java-version depName=java
ARG JAVA_JDK_VERSION=21.0.3+9.0.LTS
RUN install-tool java-jdk

# test latest gradle
RUN install-tool gradle latest

RUN gradle --version

# fail if java version mismatch
RUN gradle --version | grep "${JAVA_VERSION}"

#--------------------------------------
# test: maven
#--------------------------------------
FROM build as test-maven-a

# test openshift userid missmatch
USER 1001

# test archive.apache.org
RUN install-tool maven 3.1.0-alpha-1

RUN install-tool maven 3.5.4

# renovate: datasource=maven packageName=org.apache.maven:maven
RUN install-tool maven 3.9.8

RUN set -ex; \
  mkdir -p /tmp/mvn && cd /tmp/mvn; \
  mvn archetype:generate -DgroupId=com.mycompany.app -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DarchetypeVersion=1.4 -DinteractiveMode=false;


#--------------------------------------
# test: Scala / sbt
#--------------------------------------
FROM build as test-others


WORKDIR /

# not required / used for sbt
# renovate: datasource=github-releases packageName=scala/scala
RUN install-tool scala v2.13.14

# renovate: datasource=github-releases packageName=sbt/sbt
RUN install-tool sbt v1.10.0

RUN install-tool gradle 8.8-rc-2

# doesn't work for arbitrary users
USER 1000

WORKDIR /test
RUN set -ex; \
  cd sbt; \
  ls -la; env; \
  sbt compile


#--------------------------------------
# test: Resolve latest versions
#--------------------------------------
FROM base as test-latest-version

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
