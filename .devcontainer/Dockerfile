FROM containerbase/node:18.12.1@sha256:43e9bd267bd89357d9c7c0fffb847eaa27f24b5483053c11dbad6a617ed0ce57

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
