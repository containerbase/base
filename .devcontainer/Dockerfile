FROM containerbase/node:16.14.0@sha256:40ef7ed36b7766207607de70375a2b028f02212c0eaba59dd32e6356cf041d66

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
