FROM containerbase/node:18.15.0@sha256:6c87133e7713b71b14d639bb3fa5e05d3569f7a60cf5ee1eaeeea054b5ca95df

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
