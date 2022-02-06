FROM containerbase/node:16.13.2@sha256:3f8b0c0f4edfba97a5356c5fbaa8d49356ecbe685bffeeb8bf29d8b05ed77d46

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
