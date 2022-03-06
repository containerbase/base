FROM containerbase/node:16.14.0@sha256:651dc927daa80d709f2abf74491fa331c4857e1dd8511a2fb3fcacc55e0bb766

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
