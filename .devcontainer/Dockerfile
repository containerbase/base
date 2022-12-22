FROM containerbase/node:18.12.1@sha256:4d715891ea9a6434201991c4e5b31c11b0e19b10ddb4e45d7cb6acdf79f5a89b

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
