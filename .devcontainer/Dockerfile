FROM containerbase/node:18.15.0@sha256:3c89fc489f4d2c46d3f8e2da86421b87ad7d6b344e69465deb3d3a6a6f0fff9e

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
