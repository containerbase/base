FROM containerbase/node:16.14.0@sha256:dd2197585cb2522bb10223410c963848f5cc5af6a3487c2602739a1dcf00deaf

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
