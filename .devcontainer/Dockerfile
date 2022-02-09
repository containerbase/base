FROM containerbase/node:16.14.0@sha256:a1a133e5427f3f32036110a4841d7fd64fa3ef1089056ccd7aa916737933fa6a

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
