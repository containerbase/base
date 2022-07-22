ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# build: Java LTS base
#--------------------------------------
FROM base as build

ARG APT_HTTP_PROXY

# TODO: only lts
# renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java 11.0.16+8

#--------------------------------------
# test: gradle 6
#--------------------------------------
FROM build as testa

USER 1000

# stay on v6
# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 6.9.2


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

# renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java-jre 18.0.1+10

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.5

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
# renovate: datasource=adoptium-java packageName=java-jre
RUN install-tool java 8.0.332+9

# renovate: datasource=gradle-version versioning=gradle
RUN install-tool gradle 7.5

#--------------------------------------
# test: java 17 (non-root)
#--------------------------------------
FROM base as testd

ARG APT_HTTP_PROXY

USER 1000

# renovate: datasource=adoptium-java depName=java
ARG JAVA_VERSION=17.0.4+8
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

# test openshift userid missmatch
USER 1001

# renovate: datasource=maven packageName=org.apache.maven:maven
RUN install-tool maven 3.8.6

RUN set -ex; \
  mkdir -p /tmp/mvn && cd /tmp/mvn; \
  mvn archetype:generate -DgroupId=com.mycompany.app -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DarchetypeVersion=1.4 -DinteractiveMode=false;


#--------------------------------------
# test: scala / sbt
#--------------------------------------
FROM build as testf

# not required / used for sbt
# renovate: datasource=github-releases packageName=scala/scala
RUN install-tool scala v2.13.8

# renovate: datasource=github-releases packageName=sbt/sbt
RUN install-tool sbt v1.6.2

# doesn't work for arbitrary users
USER 1000

RUN set -ex; \
  cd sbt; \
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
