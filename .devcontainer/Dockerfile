FROM containerbase/node:16.15.0@sha256:72822ed7e3472aa3e415f0fba32740616d10996d2dfc7a05e41885dae42193ea

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
