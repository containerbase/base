FROM containerbase/node:18.13.0@sha256:bb5e281c16a86f73b78d75fb1d9849f451c87ac19d53a6e63b16e2163c600513

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
