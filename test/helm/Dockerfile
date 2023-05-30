#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/opt/containerbase/env
SHELL ["/bin/bash" , "-c"]

COPY src/ /

RUN install-containerbase

# renovate: datasource=github-releases packageName=helm/helm
ARG HELM_VERSION=3.8.0

#------------------------------------------------------------------
# testa: install helm as root, run as both
#------------------------------------------------------------------
FROM base as testa

RUN install-tool helm "v${HELM_VERSION}"

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "${HELM_VERSION}"

USER 1000

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

RUN helm version | grep "${HELM_VERSION}"

# even more restricted
USER 1000:1000

RUN set -ex; \
  helm repo update

RUN helm version | grep "${HELM_VERSION}"


#------------------------------------------------------------------
# testb: install helm as user (openshift)
#------------------------------------------------------------------
FROM base as testb

USER 1111

RUN id

RUN install-tool helm "v${HELM_VERSION}"

RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/helm") -eq 1111 ]

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "${HELM_VERSION}"


#------------------------------------------------------------------
# testc: install as user when already installed as root (openshift)
#------------------------------------------------------------------
FROM base as testc


RUN install-tool helm "v${HELM_VERSION}"

RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/helm") -eq ${USER_ID} ]

USER 1111

# do not update
RUN install-tool helm v3.7.0

RUN set -ex; helm version

RUN set -ex; \
  helm repo add stable https://charts.helm.sh/stable; \
  helm repo update

SHELL [ "/bin/sh", "-c" ]

RUN helm version | grep "3.7.0"


#------------------------------------------------------------------
# final
#------------------------------------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
