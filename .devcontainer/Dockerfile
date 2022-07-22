FROM containerbase/node:16.16.0@sha256:b38b8aa0b19c5eec2e764d511a20bfe846faca965e5daedd93ac72cbf592788e

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
