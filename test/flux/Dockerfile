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

# renovate: datasource=github-releases depName=flux packageName=fluxcd/flux2
ARG FLUX_VERSION=v0.27.4

USER 1000

#--------------------------------------
# install flux as root
#--------------------------------------
FROM base as testa

RUN install-tool flux "${FLUX_VERSION}"

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "${FLUX_VERSION}"

#--------------------------------------
# install flux as user
#--------------------------------------
FROM base as testb

USER 1111

RUN install-tool flux "${FLUX_VERSION}"

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "${FLUX_VERSION}"

#--------------------------------------
# install flux as user when already installed
#--------------------------------------
FROM base as testc

RUN install-tool flux "${FLUX_VERSION}"

USER 1111

# do not update
RUN install-tool flux 0.27.2

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "0.27.2"

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
