FROM containerbase/node:18.15.0@sha256:d0a18560ea8e3b33389eb645282a47eebfde09ae9a345e4cbeb332a1b1e624da

# renovate: datasource=npm
RUN install-tool corepack 0.17.1

USER root
RUN install-apt shellcheck
USER 1000
