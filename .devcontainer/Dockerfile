FROM containerbase/node:16.17.0@sha256:8048fff719a7d0c0622d87586eb235c76253b558b15aa5c0744e7170ae8d9ae0

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
