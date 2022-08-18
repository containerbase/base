FROM containerbase/node:16.17.0@sha256:68e65638bf7cad391399437112eeace51ec58c397c797a8e742fd6888946969d

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
