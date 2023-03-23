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

RUN install-buildpack

COPY --chown=1000:0 test/dotnet/test test
WORKDIR /test

#--------------------------------------
# net3: dotnet 3.1 base image (LTS)
#--------------------------------------
FROM base as net3

RUN install-tool dotnet 3.1.426
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

# Do not change
RUN install-tool dotnet 2.2.207
RUN install-tool dotnet 3.1.415

# renovate: datasource=dotnet packageName=dotnet-sdk
RUN install-tool dotnet 6.0.407

# Test duplicate install
# renovate: datasource=dotnet packageName=dotnet-sdk
RUN install-tool dotnet 6.0.407
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

# only patch updates
# renovate: datasource=dotnet packageName=dotnet-sdk
RUN install-tool dotnet 6.0.407
RUN set -ex; dotnet --version | grep 6.0.

RUN set -ex; \
    dotnet restore --use-lock-file

RUN set -ex;  \
    dotnet add package Newtonsoft.Json --version 12.0.3; \
    dotnet restore --force-evaluate


#--------------------------------------
# test: dotnet 7.0 (non-root)
#--------------------------------------
FROM net3 as testd

# only patch updates
# renovate: datasource=dotnet packageName=dotnet-sdk
RUN install-tool dotnet 7.0.202
RUN set -ex; dotnet --version | grep 7.0.

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
COPY --from=testd /.dummy /.dummy
