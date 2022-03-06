FROM containerbase/node:16.14.0@sha256:a5918f872725ef5bb666a841be8b8d62e0f95112668f0b8ea412c9d8e9ad244a

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
