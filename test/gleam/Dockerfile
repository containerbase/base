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
RUN install-tool gleam 0.34.1

USER 1000

#--------------------------------------
# test a: root
#--------------------------------------
FROM base as testa

SHELL [ "/bin/sh", "-c" ]
RUN gleam --version


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
