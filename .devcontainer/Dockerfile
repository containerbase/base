FROM containerbase/node:16.13.2@sha256:995c64770d2872347232bf25ad65ed13e0774b976ec8a0aad78fcc09f4345165

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
