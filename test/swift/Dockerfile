ARG IMAGE=containerbase/buildpack
ARG APT_HTTP_PROXY

#--------------------------------------
FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test


#--------------------------------------
FROM base as build

ARG APT_HTTP_PROXY
# renovate: datasource=docker versioning=docker
RUN install-tool swift 5.7.2

#--------------------------------------
# testa: swift latest
#--------------------------------------
FROM build as testa

USER 1000

RUN swift --version

RUN set -ex; \
  cd a; \
  swift package resolve

RUN set -ex; \
  cd b; \
  swift package resolve

RUN set -ex; \
  cd c; \
  swift package resolve

SHELL [ "/bin/sh", "-c" ]
RUN swift --version


#--------------------------------------
# testb: swift 5.2.5 (non-root)
#--------------------------------------
FROM build as testb

USER 1000

RUN install-tool swift 5.2.5

RUN set -ex; swift --version | grep 5.2.5

RUN set -ex; \
  cd c; \
  swift package resolve

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
