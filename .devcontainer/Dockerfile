FROM containerbase/node:16.15.1@sha256:7ec395893ab94642bf74be326c03b4cf7403219cb7ce2d936db1bb8feb7eede1

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
