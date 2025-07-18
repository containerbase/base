ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:24.04 AS containerbase

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH
COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

RUN install-containerbase

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

COPY --chown=12021:0 test/php/test test
WORKDIR /test

#--------------------------------------
# test: php 8.0
#--------------------------------------
FROM base AS testa

# no auto env for testing
SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=github-releases packageName=containerbase/php-prebuild
RUN install-tool php 8.4.10


# renovate: datasource=github-releases packageName=containerbase/composer-prebuild
RUN install-tool composer 2.8.10

# test with latest version
RUN install-tool composer latest

USER 12021

RUN set -ex; \
  [ ! -z "$(command -v php)" ] && echo "php installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("mbstring") ? 0 : 1);') && echo "php-mbstring installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("curl") ? 0 : 1);') && echo "php-curl installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("xml") ? 0 : 1);') && echo "php-xml installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("json") ? 0 : 1);') && echo "php-json installed" || exit 1;

RUN php --version
RUN composer --version

#--------------------------------------
# testd: php 8.0 (non-root)
#--------------------------------------
FROM base AS testb

# no auto env for testing
SHELL [ "/bin/sh", "-c" ]

RUN prepare-tool php

USER 12021

# test without version
RUN install-tool php

# test without version
RUN install-tool composer

# renovate: datasource=github-releases packageName=containerbase/composer-prebuild
RUN install-tool composer 2.8.10


RUN set -ex; \
  [ ! -z "$(command -v php)" ] && echo "php installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("mbstring") ? 0 : 1);') && echo "php-mbstring installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("curl") ? 0 : 1);') && echo "php-curl installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("xml") ? 0 : 1);') && echo "php-xml installed" || exit 1;

RUN set -ex; \
  $(php -r 'exit(extension_loaded("json") ? 0 : 1);') && echo "php-json installed" || exit 1;

RUN php --version
RUN composer --version

# test from getcomposer.org
# version 2.0.0 is broken
#RUN install-tool composer 2.0.0

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
