FROM containerbase/node:16.14.0@sha256:06c64fc6cf285bb40d66c9d001add43078acca7239329831605b5e30c0753b4d

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
