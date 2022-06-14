FROM containerbase/node:16.15.1@sha256:26985b100adc5ee8f6223a30f466d5e1a56310e4022cd0efe0db66251d7e4d31

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
