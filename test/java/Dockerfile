ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

ARG APT_HTTP_PROXY

# TODO: only lts
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
  touch settings.gradle; \
  gradle wrapper; \
  git diff; \
  ./gradlew --version

SHELL [ "/bin/sh", "-c" ]
RUN gradle --version

#--------------------------------------
# test: java 8
#--------------------------------------
FROM build as testb

ARG APT_HTTP_PROXY

# need to stay old
RUN install-tool java 8

# renovate: datasource=github-releases lookupName=scala/scala
RUN install-tool scala v2.13.5


#--------------------------------------
# test: java 16
#--------------------------------------
FROM build as testc

ARG APT_HTTP_PROXY

# renovate: datasource=docker lookupName=openjdk versioning=docker
RUN install-tool java 16.0.1

#--------------------------------------
# test: maven
#--------------------------------------
FROM build as testd

# renovate: datasource=maven lookupName=org.apache.maven:maven
RUN install-tool maven 3.6.3

# test openshift userid missmatch
USER 1001

RUN set -ex; \
  mvn archetype:generate -DgroupId=com.mycompany.app -DartifactId=my-app -DarchetypeArtifactId=maven-archetype-quickstart -DarchetypeVersion=1.4 -DinteractiveMode=false;

RUN set -ex; env; ls -la $MAVEN_CONFIG; id -u; id -g;

#--------------------------------------
# final
#--------------------------------------
FROM build

#COPY --from=testa /.dummy /.dummy
#COPY --from=testb /.dummy /.dummy
#COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
