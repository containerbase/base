ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

