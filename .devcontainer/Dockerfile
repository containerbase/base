FROM containerbase/node:16.17.0@sha256:606c405b963e29fd473da814cec70c92f0d63735e70a099ae361148c3277aadf

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
