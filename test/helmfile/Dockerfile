ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

RUN touch /.dummy

# renovate: datasource=github-releases packageName=helmfile/helmfile
ARG HELMFILE_VERSION=0.150.0


#------------------------------------------------------------------
# testa: install helmfile as root, run as both
#------------------------------------------------------------------
FROM build as testa

RUN install-tool helmfile "v${HELMFILE_VERSION}"

RUN set -ex; helmfile version

SHELL [ "/bin/sh", "-c" ]

RUN helmfile version | grep "${HELMFILE_VERSION}"

USER 1000

RUN helmfile version | grep "${HELMFILE_VERSION}"

# even more restricted
USER 1000:1000

RUN helmfile version | grep "${HELMFILE_VERSION}"

#------------------------------------------------------------------
# final
#------------------------------------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
