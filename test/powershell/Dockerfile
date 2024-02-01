#--------------------------------------
# Image: base
#--------------------------------------
ARG BASE_IMAGE=containerbase/base

FROM ${BASE_IMAGE} as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG
ARG GITHUB_TOKEN

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
RUN install-tool powershell v7.4.1

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
