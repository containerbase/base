#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

COPY --chown=1000:0 test/python/test test
WORKDIR /test

# RUN install-tool python 3.11.4
# RUN install-tool checkov 2.4.7

# RUN set -ex; \
#   ls -la /opt/containerbase/tools/checkov/2.4.7/3.11/bin; \
#   ls -la /opt/containerbase/tools/checkov/2.4.7/3.11/lib/python3.11/site-packages/checkov-2.4.7.dist-info; \
#   # cat /opt/containerbase/tools/checkov/2.4.7/3.11/lib/python3.11/site-packages/checkov-2.4.7.dist-info/RECORD; \
#   cat /opt/containerbase/tools/checkov/2.4.7/3.11/bin/unidiff; \
#   false

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

# Python
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.12.4

#--------------------------------------
# build-rootless
#--------------------------------------
FROM base AS build-rootless

RUN prepare-tool python

USER 1000

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.12.4

#--------------------------------------
# build: pipenv
#--------------------------------------
FROM build AS pipenv

# renovate: datasource=pypi
RUN install-tool pipenv 2024.0.1

USER 1000

#--------------------------------------
# build: poetry
#--------------------------------------
FROM build AS poetry

# renovate: datasource=pypi
RUN install-tool poetry 1.8.3

USER 1000

#--------------------------------------
# test pip-tools-a: pip-tools
#--------------------------------------
FROM build AS test-pip-tools-a

# renovate: datasource=pypi
RUN install-tool pip-tools 7.4.1

#--------------------------------------
# test pip-tools-b: pip-tools (older python)
#--------------------------------------
FROM base AS test-pip-tools-b

# python < 3.9 is not supported by the keyrings.envvars library that is installed along with pip-tools,
# so make sure we can still install on an older version
RUN install-tool python 3.8.18

# renovate: datasource=pypi
RUN install-tool pip-tools 7.4.1

#--------------------------------------
# test poetry-a: build
#--------------------------------------
FROM build AS test-poetry-a

# try install again, sould skip
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.12.4

# renovate: datasource=pypi
RUN install-tool poetry 1.8.3

USER 1000

SHELL [ "/bin/sh", "-c" ]
RUN python --version
RUN poetry --version

#--------------------------------------
# test pipenv-a: pipenv
#--------------------------------------
FROM pipenv AS test-pipenv-a

RUN set -ex; \
  cd a; \
  pipenv lock;


#--------------------------------------
# test poetry-b: c-poetry
#--------------------------------------
FROM poetry AS test-poetry-b

RUN set -ex; cd c-poetry && poetry update --lock --no-interaction

RUN set -ex; cd c-poetry && poetry add h5py


#--------------------------------------
# test poetry-c: d-poetry
#--------------------------------------
FROM poetry AS test-poetry-c

RUN set -ex; cd d-poetry && poetry update --lock --no-interaction pytest


#--------------------------------------
# test poetry-d: poetry (old versions)
#--------------------------------------
FROM base AS test-poetry-d

# python 3.12+ not supported
RUN install-tool python 3.11.6

RUN install-tool poetry 0.12.17
RUN install-tool poetry 1.1.15

#--------------------------------------
# poetry test e: root install - non root install
#--------------------------------------
FROM build AS test-poetry-e

# renovate: datasource=pypi
RUN install-tool poetry 1.8.3

USER 1001

# use older version
RUN install-tool python 3.10.0

# renovate: datasource=pypi
RUN install-tool poetry 1.8.3

#--------------------------------------
# test a: pip_requirements
#--------------------------------------
FROM build AS testa

# renovate: datasource=pypi
RUN install-tool hashin 1.0.1

RUN set -ex; \
  cd f; \
  hashin distribute==0.6.27; \
  cat requirements.txt

#--------------------------------------
# test b: non-root
#--------------------------------------
FROM build-rootless AS testb

# renovate: datasource=pypi
RUN install-tool pipenv 2024.0.1

RUN set -ex; \
  cd a; \
  pipenv lock;

# renovate: datasource=pypi
RUN install-tool poetry 1.8.3

RUN set -ex \
  && cd c-poetry \
  && poetry update --lock --no-interaction \
  && poetry add h5py \
  ;

# renovate: datasource=pypi
RUN install-tool hashin 1.0.1

RUN set -ex \
  && cd f \
  && hashin distribute==0.6.27 \
  && cat requirements.txt \
  ;


# renovate: datasource=pypi
RUN install-tool checkov 3.2.159

# test old checkov with old python
RUN install-tool python 3.7.17
RUN install-tool checkov 2.3.298

#--------------------------------------
# test pipenv-b: pipenv (multiple python)
#--------------------------------------
FROM build AS test-pipenv-b

USER 1000

# Do not update minor
RUN install-tool python 3.8.13

# make as latest
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.12.4

# renovate: datasource=pypi
RUN install-tool pipenv 2024.0.1

RUN set -ex; \
  cd h-pipenv; \
  pipenv lock;

#--------------------------------------
# test pdm: pdm (multiple python)
#--------------------------------------
FROM build AS test-pdm

USER 1000

# renovate: datasource=pypi
RUN install-tool pdm 2.16.1

#--------------------------------------
# test conan
#--------------------------------------
FROM build AS test-conan

RUN prepare-tool conan

USER 1000

# renovate: datasource=pypi
RUN install-tool conan 2.5.0

RUN set -ex; \
    cd b-conan; \
    conan lock create .; \
    conan install . --build=missing; \
    cat conan.lock

#--------------------------------------
# test c: python2.7
#--------------------------------------
FROM build-rootless AS testc

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

COPY --from=test-conan /.dummy /.dummy
COPY --from=test-pip-tools-a /.dummy /.dummy
COPY --from=test-pip-tools-b /.dummy /.dummy
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
