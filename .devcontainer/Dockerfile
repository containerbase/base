FROM containerbase/node:16.15.1@sha256:dd958856fc6da2fce4231beeb859faa384190fa73fe9fcfca0e86924a196b768

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
