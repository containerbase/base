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

# TODO: move to prepare
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.50.1

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

COPY --chown=12021:0 test/golang/test test
WORKDIR /test

#--------------------------------------
# test: golang
#--------------------------------------
FROM base AS testa

# renovate: datasource=github-releases packageName=containerbase/golang-prebuild
RUN install-tool golang 1.24.5

USER 12021

RUN set -ex; cd a; go get -d ./...; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; cd b; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; \
  cd d; \
  go get -d ./...; \
  go mod tidy;

USER root
RUN echo export "GOPATH=/home/${USER_NAME}/.go" | tee -a $BASH_ENV

USER 12021
RUN go env
RUN set -ex; cd c; go get -d ./...; cat go.sum

#--------------------------------------
# test: check first patch version eg v1.11.0
#--------------------------------------
FROM base AS testb

# do not update patch version
RUN install-tool golang 1.11.0

RUN set -ex; \
  cd d; \
  go get -d ./...; \
  go mod tidy;

USER 12021

SHELL [ "/bin/sh", "-c" ]
RUN go env

#--------------------------------------
# test: golang (non-root)
#--------------------------------------
FROM base AS testc

RUN prepare-tool golang

# emulate emtpy containerbase folders
RUN set -ex; \
  ls -la /tmp/containerbase/cache; \
  rm -rf /opt/containerbase/*; \
  ls -la /opt/containerbase/; \
  rm -rf /tmp/*; \
  ls -la /tmp/; \
  ls -la /var/lib/containerbase/; \
  cat /var/lib/containerbase/tool.prep; \
  true

USER 12021

RUN [[ ! -d /tmp/containerbase ]] || (echo "/tmp/containerbase should not exist"; exit 1 )
RUN containerbase-cli init tool golang
RUN [[ -d /tmp/containerbase ]] || (echo "/tmp/containerbase should exist"; exit 1)
RUN rm -rf /tmp/*;

# renovate: datasource=github-releases packageName=containerbase/golang-prebuild
RUN install-tool golang 1.24.5


RUN set -ex; cd a; go get -d ./...; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; cd b; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; \
  cd d; \
  go get -d ./...; \
  go mod tidy;

# test go install
RUN set -ex; \
  go install github.com/marwan-at-work/mod/cmd/mod@latest; \
  mod --help; \
  command -v mod; \
  ls -la ${USER_HOME}; \
  true

RUN set -ex; \
  [ "$(command -v mod)" = "/usr/local/bin/mod" ] && echo "works" || exit 1;

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
