ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

RUN touch /.dummy

WORKDIR /tmp

COPY --chown=1000:0 test test


#--------------------------------------
# net3: dotnet 3.1 base image
#--------------------------------------
FROM base as net3

ARG APT_HTTP_PROXY

# renovate: datasource=docker lookupName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 3.1.411

USER 1000

RUN dotnet --info

SHELL [ "/bin/sh", "-c" ]
RUN dotnet --info

#--------------------------------------
# test: dotnet 3.1
#--------------------------------------
FROM net3 as testa

RUN set -ex; \
    cd test; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    cd test; \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate


#--------------------------------------
# test: dotnet 5.0
#--------------------------------------
FROM base as testb

ARG APT_HTTP_PROXY

# renovate: datasource=docker lookupName=mcr.microsoft.com/dotnet/sdk versioning=docker
RUN install-tool dotnet 5.0.302

USER 1000

RUN set -ex; \
    cd test; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    cd test; \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
