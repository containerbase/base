ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

RUN touch /.dummy

USER 1000

# renovate: datasource=github-releases packageName=jsonnet-bundler/jsonnet-bundler
RUN install-tool jb v0.5.1

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
