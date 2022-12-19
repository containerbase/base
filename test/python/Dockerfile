ARG IMAGE=containerbase/buildpack
ARG BUILDPACK_DEBUG

FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

FROM base as build

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# Python
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.1


FROM base as build-rootless

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool python

USER 1000

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.1

#--------------------------------------
# build: pipenv
#--------------------------------------
FROM build as pipenv

ARG BUILDPACK_DEBUG

# renovate: datasource=pypi
RUN install-pip pipenv 2022.12.19


USER 1000

#--------------------------------------
# build: poetry
#--------------------------------------
FROM build as poetry
ARG BUILDPACK_DEBUG


# renovate: datasource=pypi
RUN install-tool poetry 1.3.1

USER 1000

#--------------------------------------
# test a: build
#--------------------------------------
FROM build as testa

ARG BUILDPACK_DEBUG

# try install again, sould skip
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.1

# renovate: datasource=pypi
RUN install-tool poetry 1.3.1

USER 1000

SHELL [ "/bin/sh", "-c" ]
RUN python --version
RUN poetry --version

#--------------------------------------
# test b: pipenv
#--------------------------------------
FROM pipenv as testb

RUN set -ex; \
  cd a; \
  pipenv lock;


#--------------------------------------
# test c: poetry
#--------------------------------------
FROM poetry as testc

RUN set -ex; cd c-poetry && poetry update --lock --no-interaction


RUN set -ex; cd c-poetry && poetry add h3py


#--------------------------------------
# test d: poetry
#--------------------------------------
FROM poetry as testd

RUN set -ex; cd d-poetry && poetry update --lock --no-interaction pytest


#--------------------------------------
# test e: poetry (old versions)
#--------------------------------------
FROM build as teste

ARG BUILDPACK_DEBUG

RUN install-tool poetry 0.12.17
# RUN install-tool poetry 1.1.0 // Fails tests now

#--------------------------------------
# test f: pip_requirements
#--------------------------------------
FROM build as testf

RUN pip install hashin

RUN set -ex; \
  cd f; \
  hashin distribute==0.6.27; \
  cat requirements.txt

#--------------------------------------
# test g: non-root
#--------------------------------------
FROM build-rootless as testg

ARG BUILDPACK_DEBUG

# renovate: datasource=pypi
RUN install-pip pipenv 2022.12.19

RUN set -ex; \
  cd a; \
  pipenv lock;

# renovate: datasource=pypi
RUN install-tool poetry 1.3.1

RUN set -ex \
  && cd c-poetry \
  && poetry update --lock --no-interaction \
  && poetry add h3py \
  ;

# renovate: datasource=pypi
RUN install-pip hashin 0.17.0

RUN set -ex \
  && cd f \
  && hashin distribute==0.6.27 \
  && cat requirements.txt \
  ;

#--------------------------------------
# test h: pipenv (multiple python)
#--------------------------------------
FROM build as testh

ARG BUILDPACK_DEBUG

# Do not update minor
RUN install-tool python 3.8.13

# make as latest
# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool python 3.11.1

# renovate: datasource=pypi
RUN install-pip pipenv 2022.12.19

RUN set -ex; \
  cd h-pipenv; \
  pipenv lock;

#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
COPY --from=testg /.dummy /.dummy
COPY --from=testh /.dummy /.dummy
