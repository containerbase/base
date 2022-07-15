FROM containerbase/node:16.16.0@sha256:43da5f039b82987beed291627fcfce689592a6ce567b6bc7da1732581407213f

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
