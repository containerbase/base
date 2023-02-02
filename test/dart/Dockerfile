ARG IMAGE=containerbase/base
FROM ${IMAGE} as base

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# test: dart 2.x (non-root)
#--------------------------------------
FROM base as testa

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool dart

USER 1000

RUN install-tool dart 2.0.0

# renovate datasource=docker
RUN install-tool dart 2.18.0


RUN set -ex; \
    cd a; \
    dart pub upgrade;


#--------------------------------------
# test: dart 2.x (root, openstack)
#--------------------------------------
FROM base as testb

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# renovate datasource=docker
RUN install-tool dart 2.18.0

# fix test file perms for openstack
RUN chown -R 1001 .

USER 1001

RUN set -ex; \
    cd a; \
    dart pub upgrade;


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
