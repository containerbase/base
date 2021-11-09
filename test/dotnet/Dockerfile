ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# net3: dotnet 3.1 base image
#--------------------------------------
FROM base as net3

ARG APT_HTTP_PROXY

# renovate: datasource=docker lookupName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 3.1.415

USER 1000

RUN dotnet --info

SHELL [ "/bin/sh", "-c" ]
RUN dotnet --info

#--------------------------------------
# test: dotnet 3.1
#--------------------------------------
FROM net3 as testa

RUN set -ex; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate


#--------------------------------------
# test: dotnet 5.0
#--------------------------------------
FROM base as testb

ARG APT_HTTP_PROXY

# renovate: datasource=docker lookupName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 6.0.100

USER 1000

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
