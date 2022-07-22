FROM containerbase/node:16.16.0@sha256:980a80a52cfaa21329a55af02167d2a10c7241343813a2fa285e0e5a521d96e7

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
