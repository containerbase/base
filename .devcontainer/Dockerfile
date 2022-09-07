FROM containerbase/node:16.17.0@sha256:1d546ac5cfed48946f15e0587ad206f3ffd7594aa8f5b9d73139ef9c970ac7fe

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
