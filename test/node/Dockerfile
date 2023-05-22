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

COPY --chown=1000:0 test/node/test test
RUN chmod -R 775 /test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# renovate: datasource=node
RUN install-tool node v16.20.0

USER 1000


#--------------------------------------
# test: node
#--------------------------------------
FROM build as testa

SHELL [ "/bin/sh", "-c" ]
ENTRYPOINT [ ]

RUN set -ex; \
  printenv; \
  echo $SHELL; \
  echo "$(command -v node)";

RUN set -ex; \
  [ "$(command -v node)" = "/usr/local/bin/node" ] && echo "works" || exit 1;

RUN node --version
RUN npm --version


## Test for #136
USER 0

# renovate: datasource=npm
RUN install-npm re2 1.16.0

#--------------------------------------
# test: yarn
#--------------------------------------
FROM build as testb

ARG APT_HTTP_PROXY

RUN npm install -g yarn

RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;

RUN set -ex; cd a; yarn


SHELL [ "/bin/sh", "-c" ]

USER root

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

# renovate: datasource=npm
RUN install-tool lerna 6.6.2

USER 1000

RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version

RUN set -ex; \
  [ "$(command -v lerna)" = "/usr/local/bin/lerna" ] && echo "works" || exit 1; \
  lerna --version

#--------------------------------------
# test: pnpm
#--------------------------------------

FROM build as testc

ARG APT_HTTP_PROXY

# renovate: datasource=npm
RUN install-tool pnpm 8.4.0

RUN set -ex; \
  pnpm --version;


RUN set -ex; cd a; pnpm i


SHELL [ "/bin/sh", "-c" ]
RUN set -ex; \
  pnpm --version \
  [ "$(command -v pnpm)" = "/home/${USER_NAME}/bin/pnpm" ] && echo "works" || exit 1;

#--------------------------------------
# test: node 18
#--------------------------------------

FROM base as testd

ARG APT_HTTP_PROXY

USER 1000

# renovate: datasource=node
RUN install-tool node v18.16.0

RUN npm install -g yarn
RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;

# renovate: datasource=npm
RUN install-tool yarn 1.22.19
RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;


COPY --chown=1000:0 test/node/test test

RUN set -ex; \
  npm --version; \
  command -v npm;

RUN set -ex; cd test/a; npm i

#--------------------------------------
# test: npm (install-tool npm)
#--------------------------------------
FROM build as teste

SHELL [ "/bin/sh", "-c" ]

USER root
# don't update!!
RUN install-tool npm 8.0.0

RUN npm --version
RUN npm --version | grep '8.0.0'

USER 1000

# don't update!! Should not overwrite npm
RUN install-tool node 18.13.0

RUN set -ex; npm --version
RUN set -ex; npm --version | grep '8.0.0'

# don't update!!
RUN install-tool npm 7.24.2

RUN node --version
RUN npm --version
RUN npm --version | grep '7.24.2'

#--------------------------------------
# test: npm (npm i -g npm)
#--------------------------------------
FROM build as testf

USER root
# don't update!! need force to overwrite symlink
RUN npm i -gf npm@8.0.0

RUN set -ex; command -v npm; npm --version
RUN set -ex; npm --version | grep '8.0.0'

USER 1000
# don't update!!
RUN npm i -g npm@7.24.2
RUN set -ex; command -v npm; npm --version
RUN set -ex; npm --version | grep '7.24.2'


#--------------------------------------
# test: npm (install-npm npm)
#--------------------------------------
FROM build as testg

SHELL [ "/bin/sh", "-c" ]

USER root
# don't update!!
RUN set -ex; install-npm npm 8.0.0

RUN set -ex; command -v npm; npm --version
RUN set -ex; npm --version | grep '8.0.0'

USER 1000
RUN set -ex; command -v npm; npm --version
RUN set -ex; npm --version | grep '8.0.0'
RUN chmod -R g+w .

# openshift
USER 1005
# autoload bash env required
SHELL [ "/bin/bash", "-c" ]
RUN set -ex; command -v npm; npm --version
RUN set -ex; npm --version | grep '8.0.0'
RUN set -ex; cd a; npm install

#--------------------------------------
# test: yarn-slim
#--------------------------------------
FROM build as testh

# renovate: datasource=npm packageName=yarn
RUN install-tool yarn-slim 1.22.19

RUN set -ex; yarn --version
RUN set -ex; cd a; yarn install

#--------------------------------------
# test: npm (install-tool npm, node v14)
#--------------------------------------
FROM base as testi

ARG CONTAINERBASE_DEBUG

# don't update!!
RUN install-tool node v14.18.1
RUN install-tool node v14.18.2

RUN cat $USER_HOME/.npmrc | grep "prefix = \"$USER_HOME/.npm-global\""

RUN touch /.dummy

USER 1000

COPY --chown=1000:0 test/node/test test
WORKDIR /test

# don't update!!
RUN install-tool npm 6.14.15

RUN node --version
RUN npm --version
RUN npm --version | grep '6.14.15'
RUN set -ex; cd a; npm install

#--------------------------------------
# test: openshift yarn
#--------------------------------------
FROM build as testj

USER 1111:0

ARG APT_HTTP_PROXY

RUN npm install -g yarn

RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;

RUN set -ex; ls -lah /test/a; cd a; yarn

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

# renovate: datasource=npm
RUN install-tool lerna 6.6.2

RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version

RUN set -ex; \
  [ "$(command -v lerna)" = "/usr/local/bin/lerna" ] && echo "works" || exit 1; \
  lerna --version

RUN install-tool yarn 1.22.15

#--------------------------------------
# test: openshift npm (install-tool npm)
#--------------------------------------
FROM build as testk

ARG CONTAINERBASE_DEBUG
# ENV NPM_CONFIG_LOGLEVEL=verbose

USER 1111:0

SHELL [ "/bin/sh", "-c" ]

# don't update!!
RUN install-tool npm 8.0.0

RUN npm --version
RUN npm --version | grep '8.0.0'

# don't update!!
RUN install-tool npm 7.24.2

RUN node --version
RUN npm --version
RUN npm --version | grep '7.24.2'

# don't update!!
ENV NPM_VERSION=6.14.16

RUN install-tool npm ${NPM_VERSION}

RUN node --version
RUN npm --version
RUN npm --version | grep "${NPM_VERSION}"

# TODO: use bats test
RUN set -ex; \
  [ -r /opt/buildpack/tools/npm/${NPM_VERSION}/node_modules/npm/node_modules/node-gyp/package.json ] || { echo "missing file"; exit 1; }; \
  [ "$(cat /opt/buildpack/tools/npm/${NPM_VERSION}/node_modules/npm/node_modules/node-gyp/package.json | jq -r .version)" != "5.1.0" ] \
  && echo node-gyp works || { echo "node-gyp failure"; exit 1; };

#--------------------------------------
# test: corepack
#--------------------------------------
FROM build as testl

SHELL [ "/bin/sh", "-c" ]

USER root

# don't update!!
RUN install-tool corepack 0.9.0

RUN corepack --version | tee | grep '0.9.0'

USER 1000

# renovate: datasource=npm
RUN install-tool corepack 0.17.2

RUN corepack --version
RUN corepack --version | grep '0.9.0' && exit 1 || echo 'success'

RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  [ "$(command -v pnpm)" = "/usr/local/bin/pnpm" ] && echo "works" || exit 1;

#--------------------------------------
# test: yarn (corepack)
#--------------------------------------
FROM build as testm

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool corepack 0.17.2

# renovate: datasource=npm depName=yarn
ARG YARN_VERSION=1.22.19

RUN set -ex; cd a; \
  npm pkg set packageManager=yarn@${YARN_VERSION}; \
  yarn -v | tee | grep ${YARN_VERSION}; \
  yarn install

#--------------------------------------
# test: yarn v3 (corepack)
#--------------------------------------
FROM build as testn

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool corepack 0.17.2

# test if corepack is overriding yarn
# renovate: datasource=npm
RUN install-tool yarn 1.22.19

# renovate: datasource=npm
RUN install-tool corepack 0.17.2


# renovate: datasource=npm depName=yarn
ARG YARN_VERSION=3.3.0

# re2 needs to be deleted https://github.com/uhop/install-artifact-from-github/pull/1
RUN set -ex; cd b; \
  npm pkg set packageManager=yarn@${YARN_VERSION}; \
  yarn -v; \
  yarn -v | tee | grep ${YARN_VERSION}; \
  yarn install --immutable

#--------------------------------------
# test: pnpm (corepack)
#--------------------------------------
FROM build as testo

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool corepack 0.17.2

# test if corepack is overriding pnpm
# renovate: datasource=npm
RUN install-tool pnpm 8.4.0

# renovate: datasource=npm
RUN install-tool corepack 0.17.2

# renovate: datasource=npm depName=pnpm
ARG PNPM_VERSION=8.4.0

RUN set -ex; cd a; \
  npm pkg set packageManager=pnpm@${PNPM_VERSION}; \
  pnpm -v | tee | grep ${PNPM_VERSION}; \
  pnpm install

#--------------------------------------
# test: pnpm / yarn (link / wrapper overrides)
#--------------------------------------
FROM build as testp

ARG PNPM_VERSION=6.0.0
ARG YARN_VERSION=1.22.0
ARG YARN_SLIM_VERSION=1.22.5

RUN install-tool pnpm
RUN install-tool yarn
RUN install-tool yarn-slim

# renovate: datasource=npm
RUN install-tool corepack 0.17.2

RUN install-tool pnpm
RUN install-tool yarn

RUN set -ex; \
  pnpm -v; \
  pnpm -v | grep ${PNPM_VERSION};

RUN set -ex; \
  yarn -v; \
  yarn -v | grep ${YARN_VERSION};


RUN install-tool yarn-slim
RUN set -ex; \
  yarn -v; \
  yarn -v | grep ${YARN_SLIM_VERSION};

#--------------------------------------
# test: renovate
#--------------------------------------
FROM build as testq


# renovate: datasource=npm
RUN install-tool renovate 35.98.0

RUN set -ex; \
  renovate --version; \
  renovate-config-validator; \
  true

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
COPY --from=testg /.dummy /.dummy
COPY --from=testh /.dummy /.dummy
COPY --from=testi /.dummy /.dummy
COPY --from=testj /.dummy /.dummy
COPY --from=testk /.dummy /.dummy
COPY --from=testl /.dummy /.dummy
COPY --from=testm /.dummy /.dummy
COPY --from=testn /.dummy /.dummy
COPY --from=testo /.dummy /.dummy
COPY --from=testp /.dummy /.dummy
COPY --from=testq /.dummy /.dummy
