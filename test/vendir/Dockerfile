ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

RUN touch /.dummy

# renovate: datasource=github-releases packageName=vmware-tanzu/carvel-vendir
ARG VENDIR_VERSION=0.32.2


FROM build as testa

RUN install-tool vendir "v${VENDIR_VERSION}"

RUN set -ex; vendir --version

SHELL [ "/bin/sh", "-c" ]

RUN vendir --version | grep "${VENDIR_VERSION}"

USER 1000

RUN vendir --version | grep "${VENDIR_VERSION}"

# even more restricted
USER 1000:1000

RUN vendir --version | grep "${VENDIR_VERSION}"


#------------------------------------------------------------------
# final
#------------------------------------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
