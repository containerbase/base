FROM containerbase/node:18.12.1@sha256:5945a1f204b64b196021d656be8111f752bf546b9aec154c0901f3757b651fac

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
