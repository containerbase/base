FROM containerbase/node:16.14.2@sha256:3f8d1adb6d5151b9834dc7c836b10fa64233d2a5ab7e65e002ba6db96ced93d3

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
