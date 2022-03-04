FROM containerbase/node:16.14.0@sha256:1c71be5950dc8bf9e3ee49f97a969e4ba40100508a89820b19e98e6ac281299b

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
