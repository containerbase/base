FROM containerbase/node:18.15.0@sha256:dd071f0b2cca7160df2e09f4e7e2848206c7ae705b24ccf06479d011449b8c26

# renovate: datasource=npm
RUN install-tool corepack 0.17.1

USER root
RUN install-apt shellcheck
USER 1000
