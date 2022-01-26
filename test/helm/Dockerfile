ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

USER 1000

# renovate: datasource=github-releases lookupName=helm/helm
RUN install-tool helm v3.8.0

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version
