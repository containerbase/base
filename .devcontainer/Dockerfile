FROM containerbase/node:18.15.0@sha256:b35640a3174ebc1d889e56170549e43187609473b477e72b3e45222432d290c0

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
