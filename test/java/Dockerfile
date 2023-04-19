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

# Used for tests
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.40.0

COPY --chown=1000:0 test/java/test test
WORKDIR /test

#--------------------------------------
# build: Java LTS base
#--------------------------------------
FROM base as build

RUN prepare-tool java

RUN [ "$(find /tmp -type f | wc -l)" -eq 0 ]

RUN set -ex; \
  ls -la /tmp; \
  find /tmp -type f; \
  exit 0

# TODO: only lts
# renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java 11.0.18+10

RUN set -ex; \
  ls -la /tmp; \
  find /tmp -type f; \
  exit 0


RUN [ "$(find /tmp -type f | wc -l)" -eq 0 ]

#--------------------------------------
# test: gradle 6
#--------------------------------------
FROM build as testa

RUN prepare-tool gradle

RUN set -ex; \
  ls -la $USER_HOME; \
  [ $(stat --format '%a' "${USER_HOME}/.gradle") -eq 775 ]; \
  [ $(stat --format '%a' "${USER_HOME}/.m2") -eq 775 ]; \
  exit 0

USER 1000

# stay on v6
RUN install-tool gradle 6.9
# renovate: datasource=gradle-version versioning=gradle
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
# test: java 18 + gradle 8
#--------------------------------------
FROM base as testb

# renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java-jre 18.0.2+9

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 8.1

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
# test: java 8 + gradle 7
#--------------------------------------
FROM build as testc

# need to stay old
# disable renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java 8.0.342+7

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.6.1

# test openshift userid missmatch
USER 1001

RUN gradle --version

#--------------------------------------
# test: java 17 (non-root)
#--------------------------------------
FROM base as testd

RUN prepare-tool java gradle

# test openshift userid missmatch
USER 1001

# renovate: datasource=adoptium-java depName=java
ARG JAVA_JDK_VERSION=17.0.7+7
RUN install-tool java-jdk

# test latest gradle
RUN install-tool gradle latest

RUN gradle --version

# fail if java version mismatch
RUN gradle --version | grep "${JAVA_VERSION}"

#--------------------------------------
# test: maven
#--------------------------------------
FROM build as teste

# test openshift userid missmatch
USER 1001

# renovate: datasource=maven packageName=org.apache.maven:maven
RUN install-tool maven 3.9.1

RUN set -ex; \
  mkdir -p /tmp/mvn && cd /tmp/mvn; \
  mvn archetype:generate -DgroupId=com.mycompany.app -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DarchetypeVersion=1.4 -DinteractiveMode=false;


#--------------------------------------
# test: scala / sbt
#--------------------------------------
FROM build as testf


WORKDIR /

# not required / used for sbt
# renovate: datasource=github-releases packageName=scala/scala
RUN install-tool scala v2.13.10

# renovate: datasource=github-releases packageName=sbt/sbt
RUN install-tool sbt v1.8.2

# doesn't work for arbitrary users
USER 1000

WORKDIR /test
RUN set -ex; \
  cd sbt; \
  ls -la; env; \
  sbt compile

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
