FROM containerbase/node:16.17.0@sha256:408e2478c94f29d073d1e7aaf9bb5cd48cc4d9227809c6560beb43cc85c73632

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
