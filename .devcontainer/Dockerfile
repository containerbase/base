FROM containerbase/node:16.14.1@sha256:39877f7e8b4d711680ef77344c57f413fedc9644db463338ed9f197fb1bb6e5b

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
