FROM containerbase/node:16.18.0@sha256:63d183b8b0a6d06d9759a79033c1e43d967abd8e9859dd7317b6dac76536bebf

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
