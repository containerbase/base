FROM containerbase/node:16.15.0@sha256:3f5acfeacc47c26947abeb5b37b7c7318bd7b9fb901e08071a47acad310df3d4

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
