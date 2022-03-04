FROM containerbase/node:16.14.0@sha256:8bff211b3df7fb4638120573e75d1d1ac642d76b8493a70900c21228c4c5465d

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
