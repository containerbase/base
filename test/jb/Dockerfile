#--------------------------------------
# base
#--------------------------------------
FROM containerbase/test as base

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

RUN touch /.dummy

COPY --chown=1000:0 test test

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
