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

RUN install-containerbase

#--------------------------------------
# test: powershell 7.2 (non-root)
#--------------------------------------
FROM base as testa

RUN prepare-tool powershell

USER 1000

# Don't update
RUN install-tool powershell v7.2.8


RUN set -ex; \
  pwsh -Version

RUN set -ex; \
  pwsh -Command Write-Host Hello, World!

SHELL [ "/bin/sh", "-c" ]
RUN pwsh --version

#--------------------------------------
# test: powershell 7.x
#--------------------------------------
FROM base as testb

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.3.3

USER 1000

RUN set -ex; \
  pwsh -Version

RUN set -ex; \
  pwsh -Command Write-Host Hello, World!

SHELL [ "/bin/sh", "-c" ]
RUN pwsh --version


#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
