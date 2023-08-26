#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

COPY src/ /

RUN install-containerbase

# TODO: move to prepare
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.42.0

COPY --chown=1000:0 test/golang/test test
WORKDIR /test

#--------------------------------------
# test: golang
#--------------------------------------
FROM base as testa

# renovate: datasource=docker versioning=docker
RUN install-tool golang 1.21.0

USER 1000

RUN set -ex; cd a; go get -d ./...; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; cd b; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; \
  cd d; \
  go get -d ./...; \
  go mod tidy;

USER root
RUN echo export "GOPATH=/home/${USER_NAME}/.go" | tee -a $BASH_ENV

USER 1000
RUN go env
RUN set -ex; cd c; go get -d ./...; cat go.sum

#--------------------------------------
# test: check first patch version eg v1.11.0
#--------------------------------------
FROM base as testb

# do not update patch version
RUN install-tool golang 1.11.0

RUN set -ex; \
  cd d; \
  go get -d ./...; \
  go mod tidy;

USER 1000

SHELL [ "/bin/sh", "-c" ]
RUN go env

#--------------------------------------
# test: golang (non-root)
#--------------------------------------
FROM base as testc

RUN prepare-tool golang

USER 1000

# renovate: datasource=docker versioning=docker
RUN install-tool golang 1.21.0


RUN set -ex; cd a; go get -d ./...; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; cd b; cat go.sum; go mod tidy; cat go.sum

RUN set -ex; \
  cd d; \
  go get -d ./...; \
  go mod tidy;

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
