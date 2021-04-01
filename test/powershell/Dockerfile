ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=github-releases lookupName=PowerShell/PowerShell
RUN install-tool powershell v7.1.3

USER 1000

RUN set -ex; \
  pwsh -Version

RUN set -ex; \
  pwsh -Command Write-Host Hello, World!

SHELL [ "/bin/sh", "-c" ]
RUN pwsh --version
