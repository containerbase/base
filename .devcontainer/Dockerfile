FROM containerbase/node:16.14.0@sha256:5ac7103accc6be3cd8fefd2f29184a8fe31e51fd1985e52e1ff35e48605662e0

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
