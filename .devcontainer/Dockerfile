FROM containerbase/node:16.14.0@sha256:68a6fa6d71a4c1d0ba0951352faca6679a0fabf88b9b467019e55b8df91392c1

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
