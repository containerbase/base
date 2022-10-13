FROM containerbase/node:16.18.0@sha256:083fc40fd3ba17b3a3a8a34debd1f686d15068c97c762392be72610f4b0090bf

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
