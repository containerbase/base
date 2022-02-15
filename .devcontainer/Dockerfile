FROM containerbase/node:16.14.0@sha256:bc38c4563026597cff85328be44ec589eac0b818f1a83126fa90f9c0db0d0af1

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
