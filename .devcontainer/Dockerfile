FROM containerbase/node:18.14.0@sha256:c2ac2ff78bd63ea7eb09c3065c94c1c5f6649edbb06b8c0a6e3dffe8bf88cfd0

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
