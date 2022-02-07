FROM containerbase/node:16.13.2@sha256:de1b279e147f953df65e80ba581dd1fd6d1e9a8c14d86ae3fecef28a72ef34a7

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
