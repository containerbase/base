FROM containerbase/node:16.14.2@sha256:0584f9ac394c568e96576027ac6b2ecb96ece16df64ebfb9f6843033c1a1b5aa

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
