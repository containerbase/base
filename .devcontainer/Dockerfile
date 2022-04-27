FROM containerbase/node:16.15.0@sha256:ccdff5c9dd6e262e802da53e1d583038cb13094c11a144f16dc60f0c2da60583

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
