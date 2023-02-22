FROM containerbase/node:18.14.2@sha256:14d259658a4ca18847e7044f3f2ee39ec0a1efa63d19078e9579ced83b7ee35e

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
