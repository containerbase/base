ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

RUN touch /.dummy

# renovate: datasource=github-releases lookupName=jsonnet-bundler/jsonnet-bundler
RUN install-tool jb v0.4.0

USER 1000

COPY --chown=1000:0 test test

WORKDIR /test

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
FROM build

COPY --from=testa /.dummy /.dummy
