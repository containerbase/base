FROM containerbase/node:18.14.0@sha256:0e0413a295ed1157458094a265a1adc7b93a8930b933d6d80a3ffd2651e7caa7

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
