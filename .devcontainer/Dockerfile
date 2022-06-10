FROM containerbase/node:16.15.1@sha256:78ebd9b2d6a5504552c914fa1b8e3fc246da3eb15a006e94408c0e66773fdcfe

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
