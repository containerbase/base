FROM containerbase/node:16.16.0@sha256:3414a486b326b39708486e160125a5ca5a487b8a23461e6edebb61ada8d2fbaa

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
