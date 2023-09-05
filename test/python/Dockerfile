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

COPY --chown=1000:0 test/python/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# Python
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.5

#--------------------------------------
# build-rootless
#--------------------------------------
FROM base as build-rootless

RUN prepare-tool python

USER 1000

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.5

#--------------------------------------
# build: pipenv
#--------------------------------------
FROM build as pipenv

# renovate: datasource=pypi
RUN install-tool pipenv 2023.9.1

USER 1000

#--------------------------------------
# build: poetry
#--------------------------------------
FROM build as poetry

# renovate: datasource=pypi
RUN install-tool poetry 1.6.1

USER 1000

#--------------------------------------
# test poetry-a: build
#--------------------------------------
FROM build as test-poetry-a

# try install again, sould skip
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.5

# renovate: datasource=pypi
RUN install-tool poetry 1.6.1

USER 1000

SHELL [ "/bin/sh", "-c" ]
RUN python --version
RUN poetry --version

#--------------------------------------
# test pipenv-a: pipenv
#--------------------------------------
FROM pipenv as test-pipenv-a

RUN set -ex; \
  cd a; \
  pipenv lock;


#--------------------------------------
# test poetry-b: c-poetry
#--------------------------------------
FROM poetry as test-poetry-b

RUN set -ex; cd c-poetry && poetry update --lock --no-interaction

RUN set -ex; cd c-poetry && poetry add h5py


#--------------------------------------
# test poetry-c: d-poetry
#--------------------------------------
FROM poetry as test-poetry-c

RUN set -ex; cd d-poetry && poetry update --lock --no-interaction pytest


#--------------------------------------
# test poetry-d: poetry (old versions)
#--------------------------------------
FROM build as test-poetry-d

RUN install-tool poetry 0.12.17
RUN install-tool poetry 1.1.15

#--------------------------------------
# poetry test e: root install - non root install
#--------------------------------------
FROM build as test-poetry-e

# renovate: datasource=pypi
RUN install-tool poetry 1.6.1

USER 1001

# use older version
RUN install-tool python 3.10.0

# renovate: datasource=pypi
RUN install-tool poetry 1.6.1

#--------------------------------------
# test a: pip_requirements
#--------------------------------------
FROM build as testa

# renovate: datasource=pypi
RUN install-tool hashin 0.17.0

RUN set -ex; \
  cd f; \
  hashin distribute==0.6.27; \
  cat requirements.txt

#--------------------------------------
# test b: non-root
#--------------------------------------
FROM build-rootless as testb

# renovate: datasource=pypi
RUN install-tool pipenv 2023.9.1

RUN set -ex; \
  cd a; \
  pipenv lock;

# renovate: datasource=pypi
RUN install-tool poetry 1.6.1

RUN set -ex \
  && cd c-poetry \
  && poetry update --lock --no-interaction \
  && poetry add h5py \
  ;

# renovate: datasource=pypi
RUN install-tool hashin 0.17.0

RUN set -ex \
  && cd f \
  && hashin distribute==0.6.27 \
  && cat requirements.txt \
  ;


# renovate: datasource=pypi
RUN install-tool checkov 2.4.25

#--------------------------------------
# test pipenv-b: pipenv (multiple python)
#--------------------------------------
FROM build as test-pipenv-b

USER 1000

# Do not update minor
RUN install-tool python 3.8.13

# make as latest
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.5

# renovate: datasource=pypi
RUN install-tool pipenv 2023.9.1

RUN set -ex; \
  cd h-pipenv; \
  pipenv lock;

#--------------------------------------
# test pdm: pdm (multiple python)
#--------------------------------------
FROM build as test-pdm

USER 1000

# renovate: datasource=pypi
RUN install-tool pdm 2.9.1

#--------------------------------------
# test c: python2.7
#--------------------------------------
FROM build-rootless as testc

# test older python install
RUN install-tool python 3.6.15

# needs to be v2
RUN install-tool python 2.7.18

# don't change, never versions don't work on python 2.7
RUN install-tool pipenv 2020.11.15
RUN install-tool poetry 0.12.17
RUN install-tool poetry 1.1.15
RUN install-tool hashin 0.17.0
RUN install-tool pip-tools 5.5.0

# https://github.com/python-poetry/poetry/issues/3010
RUN poetry config experimental.new-installer false

RUN set -ex; \
  poetry new poetry-demo; \
  cd poetry-demo; \
  poetry update --lock --no-interaction pytest; \
  true

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-poetry-a /.dummy /.dummy
COPY --from=test-poetry-b /.dummy /.dummy
COPY --from=test-poetry-c /.dummy /.dummy
COPY --from=test-poetry-d /.dummy /.dummy
COPY --from=test-poetry-e /.dummy /.dummy
COPY --from=test-pipenv-a /.dummy /.dummy
COPY --from=test-pipenv-b /.dummy /.dummy
COPY --from=test-pdm /.dummy /.dummy
COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
