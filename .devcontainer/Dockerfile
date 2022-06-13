FROM containerbase/node:16.15.1@sha256:347382e0ac3c36a3d77517c26a50db76c9c2a03e2e3f0e2768598da5f0cb333f

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
