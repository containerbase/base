FROM containerbase/node:16.15.0@sha256:e4c5ec76523a2b18634026839b727e49dd604b39a30c34afb25542d987e1bbe1

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
