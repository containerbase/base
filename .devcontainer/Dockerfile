FROM containerbase/node:16.16.0@sha256:00529305710a16384d6cc5923fc8542a86e1dcba25889c39055c971c3008631b

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
