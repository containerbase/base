ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base


RUN touch /.dummy

WORKDIR /tmp
COPY --chown=1000:0 test test

FROM base as build

# Python
# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
RUN install-tool python 3.9.4


FROM base as build-rootless

USER 1000

# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
RUN install-tool python 3.9.4

#--------------------------------------
# build: pipenv
#--------------------------------------
FROM build as pipenv

# renovate: datasource=pypi
RUN install-pip pipenv 2020.11.15


USER 1000

#--------------------------------------
# build: poetry
#--------------------------------------
FROM build as poetry

# renovate: datasource=pypi
RUN install-tool poetry 1.1.5

USER 1000

#--------------------------------------
# test a: build
#--------------------------------------
FROM build as testa

# try install again, sould skip
# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
RUN install-tool python 3.9.4

# renovate: datasource=pypi
RUN install-tool poetry 1.1.5

USER 1000

SHELL [ "/bin/sh", "-c" ]
RUN python --version
RUN poetry --version

#--------------------------------------
# test b: pipenv
#--------------------------------------
FROM pipenv as testb

RUN set -ex; \
  cd test/a; \
  pipenv lock;


#--------------------------------------
# test c: poetry
#--------------------------------------
FROM poetry as testc

RUN set -ex; cd test/c-poetry && poetry update --lock --no-interaction


RUN set -ex; cd test/c-poetry && poetry add h3py


#--------------------------------------
# test d: poetry
#--------------------------------------
FROM poetry as testd

RUN set -ex; cd test/d-poetry && poetry update --lock --no-interaction pytest


#--------------------------------------
# test e: poetry
#--------------------------------------
FROM poetry as teste

RUN set -ex; \
  git clone --depth=1 https://github.com/renovate-tests/poetry1; \
  cd poetry1; \
  poetry update --lock --no-interaction pytest; \
  git status -s; \
  git checkout -f; \
  git clean -fdx; \
  poetry update --lock --no-interaction; \
  git status -s;

#--------------------------------------
# test f: pip_requirements
#--------------------------------------
FROM build as testf

RUN pip install hashin

RUN set -ex; \
  cd test/f; \
  hashin distribute==0.6.27; \
  cat requirements.txt

#--------------------------------------
# test g: non-root
#--------------------------------------
FROM build-rootless as testg

# renovate: datasource=pypi
RUN install-pip pipenv 2020.11.15

RUN set -ex; \
  cd test/a; \
  pipenv lock;

# renovate: datasource=pypi
RUN install-tool poetry 1.1.5

RUN set -ex \
  && cd test/c-poetry \
  && poetry update --lock --no-interaction \
  && poetry add h3py \
  ;

# renovate: datasource=pypi
RUN install-pip hashin 0.15.0

RUN set -ex \
  && cd test/f \
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
