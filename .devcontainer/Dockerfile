FROM containerbase/node:18.14.2@sha256:cb68fa4baae8632f43734cd9d98a80cf0a3c6a6f7898beb4173563a1ddd98a80

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
