FROM containerbase/node:16.15.0@sha256:e854cbb6f58493008aa69508b6f397f02f1789ba5d4cf57ee101e034ab55fe05

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
