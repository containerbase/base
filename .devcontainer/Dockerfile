FROM containerbase/node:16.14.2@sha256:8f901e06aa899e4e2fd7733a190e7e70a07b9ada10cf05e34814441f327af9ef

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
