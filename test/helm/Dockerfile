ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

RUN touch /.dummy

# renovate: datasource=github-releases lookupName=helm/helm
ARG HELM_VERSION=3.8.0

#--------------------------------------
# install helm as root
#--------------------------------------
FROM build as testa

RUN install-tool helm "v${HELM_VERSION}"

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "${HELM_VERSION}"

#--------------------------------------
# install helm as user
#--------------------------------------
FROM build as testb

USER 1111

RUN install-tool helm "v${HELM_VERSION}"

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "${HELM_VERSION}"

#--------------------------------------
# install helm as user when already installed
#--------------------------------------
FROM build as testc

USER 1000

RUN install-tool helm "v${HELM_VERSION}"

USER 1111

# do not update
RUN install-tool helm v3.7.0

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "3.7.0"

#--------------------------------------
# install helm user 1000:1000
#--------------------------------------
FROM build as testd

USER 1000:1000

RUN install-tool helm "v${HELM_VERSION}"

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "${HELM_VERSION}"

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
