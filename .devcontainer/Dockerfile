FROM containerbase/node:16.16.0@sha256:58c6f029b3610605eafd8fed16fa082c75f0100749854843d3f225d315b05657

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
