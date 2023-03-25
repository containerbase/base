FROM containerbase/node:18.15.0@sha256:cfdd74d2c66d613eff07d9763943b9e065c77756e4661b87070f0c627fc796c7

# renovate: datasource=npm
RUN install-tool corepack 0.17.1

USER root
RUN install-apt shellcheck
USER 1000
