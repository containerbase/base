FROM containerbase/node:16.17.0@sha256:215cf61685637356422002db10398d6de252db2d1ffc5718c7c402236c10acb0

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
