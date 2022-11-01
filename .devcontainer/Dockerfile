FROM containerbase/node:18.12.0@sha256:dab36a9935ce28f0e2cdf25083a3d810fff98877832f13a239a1e30714829b12

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
