FROM containerbase/node:16.14.0@sha256:4ae588f178f32e50c8ef37225933db34717bca1c365da18fe6183782e96566e1

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
