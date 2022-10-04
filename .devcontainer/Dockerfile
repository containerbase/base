FROM containerbase/node:16.17.1@sha256:1f0c3112c83a05cd15d4448346a1d77a37dce53a5f9a5e3c4753902c94ef9526

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
