ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# test: flutter 1.x (root)
#--------------------------------------
FROM base as testa

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# renovate datasource=flutter-version
RUN install-tool flutter 1.22.6

USER 1000

RUN set -ex; \
    cd a; \
    flutter pub upgrade;

RUN set -ex; \
    cd b; \
    flutter pub upgrade;

#--------------------------------------
# test: flutter 1.x (non-root)
#--------------------------------------
FROM base as testb

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool flutter

USER 1000

# renovate datasource=flutter-version
RUN install-tool flutter 1.22.6

RUN set -ex; \
    cd a; \
    flutter pub upgrade;

RUN set -ex; \
    cd b; \
    flutter pub upgrade;

#--------------------------------------
# test: flutter 2.x (non-root)
#--------------------------------------
FROM base as testc

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool flutter

USER 1000

# renovate datasource=flutter-version
RUN install-tool flutter 2.2.2

RUN set -ex; \
    cd c; \
    flutter pub upgrade;

#--------------------------------------
# test: flutter 3.x (non-root)
#--------------------------------------
FROM base as testd

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool flutter

USER 1000

# renovate datasource=flutter-version
RUN install-tool flutter 3.0.2

RUN set -ex; \
    cd c; \
    flutter pub upgrade;

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
