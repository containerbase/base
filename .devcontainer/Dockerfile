FROM containerbase/node:18.12.0@sha256:e3914c9144cc6f08cbca4e4e089912a5a304f7ee9830b27ec150276dbaf77bbc

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
