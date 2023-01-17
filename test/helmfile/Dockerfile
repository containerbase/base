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
# testb: install helmfile as user (openshift)
#------------------------------------------------------------------
FROM build as testb

USER 1111

RUN install-tool helmfile "v${HELMFILE_VERSION}"

RUN set -ex; helmfile version

SHELL [ "/bin/sh", "-c" ]

RUN helmfile version | grep "${HELMFILE_VERSION}"


#------------------------------------------------------------------
# testc: install as user when already installed as root (openshift)
#------------------------------------------------------------------
FROM build as testc

RUN install-tool helmfile "v${HELMFILE_VERSION}"

USER 1111

# do not update
RUN install-tool helmfile v0.140.0

RUN set -ex; helmfile version

SHELL [ "/bin/sh", "-c" ]

RUN helmfile version | grep "0.149.0"


#------------------------------------------------------------------
# final
#------------------------------------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
