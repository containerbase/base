FROM containerbase/node:16.14.0@sha256:8b8b6523579905dab3a46ad3e51125aae48df08bfefc5e555d264beeb0b332ca

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
