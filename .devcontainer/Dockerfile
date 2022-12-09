FROM containerbase/node:18.12.1@sha256:8072c03a4c13cecdafe08405db2575d029420a027f8df82b384c465778ea8804

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
