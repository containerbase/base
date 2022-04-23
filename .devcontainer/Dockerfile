FROM containerbase/node:16.14.2@sha256:f7ba68e9fbe55d7ef4dd1a72899fba25519c4bbacf8b4efc91dff67baf464909

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
