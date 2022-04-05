FROM containerbase/node:16.14.2@sha256:be3f893ff4b0a718f1756875733a8f2eccedf30082292b3415bde75c362357ec

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
