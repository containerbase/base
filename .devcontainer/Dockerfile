FROM containerbase/node:18.15.0@sha256:0359d0e4bac80ee84d104f347ec86d88f4df631bfa6b16c9254fc9daffe6ec9b

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
