FROM containerbase/node:16.16.0@sha256:8c9947717dcffc82137b13c1529ab185a50b9691f506b9c5088e0eead8a35eea

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
