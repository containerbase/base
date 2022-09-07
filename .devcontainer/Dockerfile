FROM containerbase/node:16.17.0@sha256:642b9d93ff4a265aa1aa12d38e78dc0141332c9b55404b3bec11b1288d78f20f

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
