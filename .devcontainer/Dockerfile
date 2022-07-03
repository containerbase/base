FROM containerbase/node:16.15.1@sha256:9a509cc92dcc766044a0e6f90c7a7e47d82cf47a1ebac28b1f5b50780a5e2a84

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
