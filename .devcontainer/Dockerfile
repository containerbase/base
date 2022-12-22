FROM containerbase/node:18.12.1@sha256:3933747c2635ec1941864ee44645492c89705891c2fc70da5d6f8a198753d393

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
