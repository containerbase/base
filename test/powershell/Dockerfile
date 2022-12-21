ARG IMAGE=containerbase/buildpack
ARG APT_HTTP_PROXY

#--------------------------------------
FROM ${IMAGE} as base

RUN touch /.dummy

#--------------------------------------
# test: powershell 7.2
#--------------------------------------
FROM build as testa

ARG APT_HTTP_PROXY

# Don't update
RUN install-tool powershell v7.2.8

USER 1000

RUN set -ex; \
  pwsh -Version

RUN set -ex; \
  pwsh -Command Write-Host Hello, World!

SHELL [ "/bin/sh", "-c" ]
RUN pwsh --version

#--------------------------------------
# test: powershell 7.x
#--------------------------------------
FROM build as testb
ARG APT_HTTP_PROXY

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.3.0

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
