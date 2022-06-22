FROM containerbase/node:16.15.1@sha256:a28196cc603ce306c66876e7bbfc44b756841edc145c20d08c5efaa3e2e95273

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
