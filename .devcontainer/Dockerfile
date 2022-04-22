FROM containerbase/node:16.14.2@sha256:6b34f5018e49648e555090e26cff62d4d5ee04ca68cebc64801d90f11124fc1e

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
