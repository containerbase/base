FROM containerbase/node:18.14.1@sha256:14c0635710604c765c735d745dc31ef6d5b59ed6ca47c372dd19d32d28328238

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
