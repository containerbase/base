FROM containerbase/node:16.17.0@sha256:ff419b84b2804c39f7278861353223a17105ff22a9566e991a9be2d5698c0393

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
