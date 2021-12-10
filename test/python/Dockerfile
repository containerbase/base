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
# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
RUN install-tool python 3.10.1


FROM base as build-rootless

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

USER 1000

# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
RUN install-tool python 3.10.1

#--------------------------------------
# build: pipenv
#--------------------------------------
FROM build as pipenv

ARG BUILDPACK_DEBUG

# renovate: datasource=pypi
RUN install-pip pipenv 2021.11.23


USER 1000

#--------------------------------------
# build: poetry
#--------------------------------------
FROM build as poetry
ARG BUILDPACK_DEBUG


# renovate: datasource=pypi
RUN install-tool poetry 1.1.12

USER 1000

#--------------------------------------
# test a: build
#--------------------------------------
FROM build as testa

ARG BUILDPACK_DEBUG

# try install again, sould skip
# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
RUN install-tool python 3.10.1

# renovate: datasource=pypi
RUN install-tool poetry 1.1.12

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
RUN install-tool poetry 1.1.0

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
RUN install-pip pipenv 2021.11.23

RUN set -ex; \
  cd a; \
  pipenv lock;

# renovate: datasource=pypi
RUN install-tool poetry 1.1.12

RUN set -ex \
  && cd c-poetry \
  && poetry update --lock --no-interaction \
  && poetry add h3py \
  ;

# renovate: datasource=pypi
RUN install-pip hashin 0.15.0

RUN set -ex \
  && cd f \
  && hashin distribute==0.6.27 \
  && cat requirements.txt \
  ;


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
