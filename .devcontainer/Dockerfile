FROM containerbase/node:16.14.2@sha256:a54bca7d331c32877ef32c2795ceaac71bee4d401909504367e7ec1502fa0823

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
