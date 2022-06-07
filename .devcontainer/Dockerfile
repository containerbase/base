FROM containerbase/node:16.15.1@sha256:863dc8875e42394fa2f3f88b4d2f00d3318b00210a2d82a26b958884adb2da37

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
