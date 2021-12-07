ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=github-releases lookupName=helm/helm
RUN install-tool helm v3.7.1

USER 1000

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update


SHELL [ "/bin/sh", "-c" ]
RUN helm version
