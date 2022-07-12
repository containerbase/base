FROM containerbase/node:16.16.0@sha256:1e92e66b580d003347024b43c586bf77271e184b6b25af869eaa7113f9206ab6

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
