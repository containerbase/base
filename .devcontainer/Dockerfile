FROM containerbase/node:16.18.0@sha256:dea2defddcdfdcc0e91c98097b60b629cc8262aa55543af1d1a8a9a610642d95

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
