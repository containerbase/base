FROM containerbase/node:16.17.1@sha256:4a6a4e3002273b49090d7ad0c0e05e216e4cd7c147cf5d586351650f8f0ecc1a

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
