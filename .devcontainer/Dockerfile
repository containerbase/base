FROM containerbase/node:16.13.2@sha256:d728afedaa462ef4af019b0abd27d1015d723905f287df73c6098d4e8245e5dd

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
