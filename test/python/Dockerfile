#--------------------------------------
# Image: base
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04 AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

COPY --chown=1000:0 test/python/test test
WORKDIR /test

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

RUN prepare-tool python conan

USER 1000

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.12.4

#--------------------------------------
# build: pipenv
#--------------------------------------
FROM build AS pipenv

# renovate: datasource=pypi
RUN install-tool pipenv 2024.0.1
# renovate: datasource=pypi
RUN install-tool pipenv 2024.0.1

USER 1000

#--------------------------------------
# build: poetry
#--------------------------------------
FROM build AS poetry


# renovate: datasource=pypi
RUN install-tool poetry 1.8.3
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
# test poetry-a: (rootless)
#--------------------------------------
FROM build-rootless AS test-poetry-a

# try install again, sould skip
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.12.4

# renovate: datasource=pypi
RUN install-tool poetry 1.8.3


SHELL [ "/bin/sh", "-c" ]
RUN python --version
RUN poetry --version

RUN set -ex \
  && cd c-poetry \
  && poetry update --lock --no-interaction \
  && poetry add h5py \
  ;


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
RUN install-tool hashin 1.0.1

RUN set -ex \
  && cd f \
  && hashin distribute==0.6.27 \
  && cat requirements.txt \
  ;


# renovate: datasource=pypi
RUN install-tool checkov 3.2.217

# test old checkov with old python
RUN install-tool python 3.7.17
RUN install-tool checkov 2.3.298


#--------------------------------------
# test pipenv-a
#--------------------------------------
FROM pipenv AS test-pipenv-a

RUN set -ex; \
  cd a; \
  pipenv lock;

#--------------------------------------
# test pipenv-b (rootless)
#--------------------------------------
FROM build-rootless AS test-pipenv-b

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
# test pdm
#--------------------------------------
FROM build-rootless AS test-pdm

# renovate: datasource=pypi
RUN install-tool pdm 2.17.3

#--------------------------------------
# test conan
#--------------------------------------
FROM build AS test-conan

RUN prepare-tool conan

USER 1000

# renovate: datasource=pypi
RUN install-tool conan 2.6.0

RUN set -ex; \
    cd b-conan; \
    conan lock create .; \
    conan install . --build=missing; \
    cat conan.lock

#--------------------------------------
# test copier
#--------------------------------------
FROM build-rootless AS test-copier

# renovate: datasource=pypi
RUN install-tool copier 9.3.1

#--------------------------------------
# test install-pip
#--------------------------------------
FROM build-rootless AS test-other

RUN install-tool conan

RUN install-pip checkov
RUN install-pip copier
RUN install-pip hashin
RUN install-pip pdm
RUN install-pip pip-tools
RUN install-pip pipenv
RUN install-pip poetry

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=test-conan /.dummy /.dummy
COPY --from=test-copier /.dummy /.dummy
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
COPY --from=test-other /.dummy /.dummy
