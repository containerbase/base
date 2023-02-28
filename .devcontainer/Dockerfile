FROM containerbase/node:18.14.2@sha256:d3817b7251a8b3389d759394171e84c5afb7352f61d5ed5b12703977673a444c

# renovate: datasource=npm
RUN install-tool corepack 0.16.0

USER root
RUN install-apt shellcheck
USER 1000
