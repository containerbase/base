FROM containerbase/node:16.15.0@sha256:4a7e6a1db3f8c1c7e0261d9c10b80e8f9aaff512963d30902c593a869d50a2d9

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
