FROM containerbase/node:18.13.0@sha256:abef7c8cdb310fb5db891b93319f3fae07871840cb96924f7020b42519ba852a

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
