FROM containerbase/node:16.17.1@sha256:5a8ff2050415d15b4fc827d1423ff9b4f9ed45caaf7a0b6e09f7adc5fc71f7a0

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
