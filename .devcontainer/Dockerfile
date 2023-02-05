FROM containerbase/node:18.14.0@sha256:9801f4462cd17f67f2d3c0c1945f2bf06778f6b722a8c8881b99867050b81e53

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
