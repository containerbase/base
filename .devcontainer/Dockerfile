FROM containerbase/node:16.16.0@sha256:a26c784381ae868e128249c89052982b57079ee2676d96b90bb0e2c25e722d79

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
