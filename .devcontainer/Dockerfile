FROM containerbase/node:18.13.0@sha256:cdceaa1b5b3bf442183b755e345fec5fad6b12c70e3202b5a45fa07f68d682fc

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
