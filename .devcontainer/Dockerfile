FROM containerbase/node:18.13.0@sha256:fd2297e87fd240865faa17f864517fb1d31e37f38f3557596724f357f80a4452

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
