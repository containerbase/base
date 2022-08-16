FROM containerbase/node:16.17.0@sha256:2f919ff30f8bede4a4fba62b298b58e267ad778bdcb652a50a114063ad63321b

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
