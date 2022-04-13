FROM containerbase/node:16.14.2@sha256:2180db89115294afb877ddbeffad342a5e02740ade0580ca12e0212c68d6ae8e

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
