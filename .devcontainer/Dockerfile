FROM containerbase/node:18.14.1@sha256:a1c21e163dc74321763e307186296b388956b4933e288f8a39399a8af1094882

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
