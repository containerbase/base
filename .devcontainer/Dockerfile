FROM containerbase/node:18.14.2@sha256:a72354f9adea2a6b7230c64403f77a13a201e2356843e012f3be5edd259adec1

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
