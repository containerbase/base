ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=github-releases lookupName=PowerShell/PowerShell
RUN install-tool powershell v7.1.3

RUN touch /.dummy

WORKDIR /tmp

COPY --chown=1000:0 test test

#--------------------------------------
# test: powershell
#--------------------------------------
FROM build as testa

RUN set -ex; \
  pwsh -Version

RUN set -ex; \
  pwsh -Command Write-Host Hello, World!

SHELL [ "/bin/sh", "-c" ]
RUN pwsh --version

#--------------------------------------
# test: powershell
#--------------------------------------
FROM build as testb

# renovate: datasource=github-releases lookupName=lukesampson/scoop
RUN install-tool scoop 2020-11-26

SHELL [ "/usr/local/bin/pwsh", "-Command" ]

RUN /usr/local/scoop/2020-11-26/bin/checkver.ps1 nodejs -Dir test -Update;

#--------------------------------------
# final
#--------------------------------------
FROM ${IMAGE}

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy