#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/opt/containerbase/env
SHELL ["/bin/bash" , "-c"]

COPY src/ /

RUN install-containerbase

COPY --chown=1000:0 test/jb/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base as build

USER 1000

# renovate: datasource=github-releases packageName=jsonnet-bundler/jsonnet-bundler
RUN install-tool jb v0.5.1


#--------------------------------------
# test: jb install
#--------------------------------------

FROM build as testa

RUN set -ex; \
    jb install; \
    test -d vendor/github.com/prometheus-operator/prometheus-operator; \
    test -d vendor/prometheus-operator

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
