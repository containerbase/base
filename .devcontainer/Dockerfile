FROM containerbase/node:16.17.0@sha256:49e6e3bcbdf02488ab991b8367d18f1650586f218aa2678f32512be2bc5d5b23

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
