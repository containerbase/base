ARG IMAGE=containerbase/base
FROM ${IMAGE} as build

RUN touch /.dummy

# renovate: datasource=github-releases packageName=fluxcd/flux2
ARG FLUX_VERSION=0.27.3

USER 1000

#--------------------------------------
# install flux as root
#--------------------------------------
FROM build as testa

RUN install-tool flux "${FLUX_VERSION}"

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "${FLUX_VERSION}"

#--------------------------------------
# install flux as user
#--------------------------------------
FROM build as testb

USER 1111

RUN install-tool flux "${FLUX_VERSION}"

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "${FLUX_VERSION}"

#--------------------------------------
# install flux as user when already installed
#--------------------------------------
FROM build as testc

RUN install-tool flux "${FLUX_VERSION}"

USER 1111

# do not update
RUN install-tool flux 0.27.2

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "0.27.2"

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
