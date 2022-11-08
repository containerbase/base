ARG IMAGE=containerbase/buildpack
ARG BUILDPACK_DEBUG

FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# net3: dotnet 3.1 base image (LTS)
#--------------------------------------
FROM base as net3

ARG BUILDPACK_DEBUG
ARG APT_HTTP_PROXY

# stay at 3.1
# renovate: datasource=docker packageName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 3.1.425
RUN set -ex; dotnet --version | grep 3.1.

USER 1000

RUN dotnet --info

SHELL [ "/bin/sh", "-c" ]
RUN dotnet --info

#--------------------------------------
# test: dotnet 3.1 (LTS)
#--------------------------------------
FROM net3 as testa

RUN set -ex; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate


#--------------------------------------
# test: dotnet 6.0 (LTS)
#--------------------------------------
FROM base as testb

ARG BUILDPACK_DEBUG
ARG APT_HTTP_PROXY

# Do not change
RUN install-tool dotnet 2.2.207
RUN install-tool dotnet 3.1.415

# renovate: datasource=docker packageName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 6.0.402

# Test duplicate install
# renovate: datasource=docker packageName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 6.0.402
RUN set -ex; dotnet --version | grep 6.0.

USER 1000

RUN dotnet --info


RUN set -ex; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate; \
    dotnet build

#--------------------------------------
# test: dotnet 6.0 (non-root, LTS)
#--------------------------------------
FROM net3 as testc

ARG BUILDPACK_DEBUG

# only patch updates
# renovate: datasource=docker packageName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 6.0.402
RUN set -ex; dotnet --version | grep 6.0.

RUN set -ex; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
