FROM containerbase/node:18.12.1@sha256:d02df98f38fdbacf46ad5a22882e32e61edb6210a7d5e60db466a2d592fb33c8

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
