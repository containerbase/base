FROM containerbase/node:16.14.2@sha256:65dd42c12a25211afddeeac03ec34aaa7318e76f2221c5020f5289ce2340c439

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
