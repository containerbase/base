#--------------------------------------
# Non-root user to create
#--------------------------------------
ARG USER_ID=1000
ARG USER_NAME=user

#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal@sha256:b4f9e18267eb98998f6130342baacaeb9553f136142d40959a1b46d6401f0f2b

ARG USER_ID
ARG USER_NAME

LABEL maintainer="Rhys Arkins <rhys@arkins.net>" \
  org.opencontainers.image.source="https://github.com/containerbase/buildpack"

#  autoloading buildpack env
ENV BASH_ENV=/usr/local/etc/env
ENV ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]

COPY src/ /

RUN install-buildpack


# renovate: datasource=github-tags lookupName=git/git
RUN install-tool git v2.31.0

