FROM containerbase/node:16.17.0@sha256:21479b52685e792df1a68e454acabea66099c4b1370c63697db7f3d150c6a4ab

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
