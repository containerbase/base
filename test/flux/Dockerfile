#--------------------------------------
# Image: base
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04 AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

# renovate: datasource=github-releases depName=flux packageName=fluxcd/flux2
ARG FLUX_VERSION=v2.3.0

USER 1000

#--------------------------------------
# install flux as root
#--------------------------------------
FROM base AS testa

RUN install-tool flux "${FLUX_VERSION}"

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "${FLUX_VERSION#v}"

#--------------------------------------
# install flux as user
#--------------------------------------
FROM base AS testb

USER 1111

RUN install-tool flux "${FLUX_VERSION}"

SHELL [ "/bin/sh", "-c" ]

RUN flux -v | grep "${FLUX_VERSION#v}"

#--------------------------------------
# install flux as user when already installed
#--------------------------------------
FROM base AS testc

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
