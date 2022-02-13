FROM containerbase/node:16.14.0@sha256:6090748fc6756b203cc0060f664ca98f96aec75ab083090895f36a318eadb629

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
