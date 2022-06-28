FROM containerbase/node:16.15.1@sha256:0518c696e086e12606983e73d6d7647b3566873a4886881b690266c732721098

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
