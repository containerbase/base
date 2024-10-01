ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04 AS containerbase

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

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

COPY --chown=12021:0 test/node/test test
RUN chmod -R 775 /test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 20.17.0

# ensure npmrc is writable by user
RUN set -ex; [ $(stat --format '%u' "/opt/containerbase/home/.npmrc") -eq ${USER_ID} ]

USER 12021


#--------------------------------------
# test: node
#--------------------------------------
FROM build AS testa

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

ARG RE2_DOWNLOAD_MIRROR=https://github.com/containerbase/node-re2-prebuild/releases/download RE2_DOWNLOAD_SKIP_PATH=1
# renovate: datasource=npm
RUN npm install -g re2@1.20.9

#--------------------------------------
# test: yarn
#--------------------------------------
FROM build AS testb

SHELL [ "/bin/sh", "-c" ]

USER root

# renovate: datasource=npm
RUN install-tool yarn 1.22.22

USER 12021

RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version

RUN set -ex; cd a; yarn; test -d node_modules/.bin || exit 1

RUN install-tool yarn 2.4.2
RUN install-tool yarn 3.8.1

# renovate: datasource=npm packageName=@yarnpkg/cli-dist
RUN install-tool yarn 4.5.0

#--------------------------------------
# test: pnpm
#--------------------------------------

FROM build AS testc

# renovate: datasource=npm
RUN install-tool pnpm 9.11.0

RUN set -ex; \
  pnpm --version;

SHELL [ "/bin/sh", "-c" ]

RUN set -ex; cd a; pnpm i

#--------------------------------------
# test: node 18
#--------------------------------------

FROM base AS testd

RUN prepare-tool node

USER 12021

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node v18.20.4

RUN npm install -g yarn
RUN set -ex; \
  [ "$(command -v yarn)" = "" ] && echo "works" || exit 1; \
  true;

# renovate: datasource=npm
RUN install-tool yarn 1.22.22
RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;


COPY --chown=12021:0 test/node/test test

RUN set -ex; \
  npm --version; \
  command -v npm;

RUN set -ex; cd test/a; npm i

# renovate: datasource=npm
RUN install-npm del-cli 5.1.0
RUN del -d test/a/**

#--------------------------------------
# test: npm (install-tool npm)
#--------------------------------------
FROM build AS teste

SHELL [ "/bin/sh", "-c" ]

USER root
# don't update!!
RUN install-tool npm 8.0.0

RUN npm --version
RUN npm --version | grep '8.0.0'

USER 12021

# don't update!! Should overwrite npm
RUN install-tool node 18.13.0

RUN set -ex; npm --version
RUN set -ex; npm --version | grep '8.19.3'

# don't update!!
RUN install-tool npm 7.24.2

RUN node --version
RUN npm --version
RUN npm --version | grep '7.24.2'

#--------------------------------------
# test: use npm from node to install
#--------------------------------------
FROM build AS testf

RUN install-tool node 10.24.0
# intentionally fails
RUN install-tool npm 9.5.1 || true
RUN install-tool yarn-slim 1.22.19
RUN install-tool node v20.9.0
RUN install-tool yarn-slim 1.22.19
RUN yarn --version


#--------------------------------------
# test: npm (npm install -g npm)
#--------------------------------------
FROM build AS testg

SHELL [ "/bin/sh", "-c" ]

USER root
# don't update!!
RUN set -ex; npm install -gf npm@8.0.0

RUN set -ex; command -v npm; npm --version
RUN set -ex; npm --version | grep '8.0.0'

USER 12021
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
FROM build AS testh

# renovate: datasource=npm packageName=yarn
RUN install-tool yarn-slim 1.22.22

RUN set -ex; yarn --version
RUN set -ex; cd a; yarn install; [[ ! -d node_modules/.bin ]] || exit 1

#--------------------------------------
# test: npm (install-tool npm, node v14)
#--------------------------------------
FROM base AS testi

ARG CONTAINERBASE_DEBUG

# don't update!!
RUN install-tool node v14.18.1
RUN install-tool node v14.18.2

RUN set -ex; ls -la $USER_HOME/; test -L $USER_HOME/.npmrc

RUN touch /.dummy

USER 12021

COPY --chown=12021:0 test/node/test test
WORKDIR /test

# don't update!!
RUN install-tool npm 6.14.15

RUN node --version
RUN npm --version
RUN npm --version | grep '6.14.15'
# ignore scripts to speedup test (re2 is no longer compatible with node 14)
RUN set -ex; cd a; npm install --ignore-scripts

#--------------------------------------
# test: openshift yarn
#--------------------------------------
FROM build AS testj

USER 1111:0


SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool yarn 1.22.22

RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version

RUN set -ex; ls -lah /test/a; cd a; yarn

RUN install-tool yarn 1.22.15

#--------------------------------------
# test: openshift npm (install-tool npm)
#--------------------------------------
FROM build AS testk

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
  export NODE_VERSION=$(cat /opt/containerbase/versions/node); \
  [ -r /opt/containerbase/tools/npm/${NPM_VERSION}/${NODE_VERSION}/node_modules/npm/node_modules/node-gyp/package.json ] || { echo "missing file"; exit 1; }; \
  [ "$(cat /opt/containerbase/tools/npm/${NPM_VERSION}/${NODE_VERSION}/node_modules/npm/node_modules/node-gyp/package.json | jq -r .version)" != "5.1.0" ] \
  && echo node-gyp works || { echo "node-gyp failure"; exit 1; };

#--------------------------------------
# test: corepack
#--------------------------------------
FROM build AS testl

SHELL [ "/bin/sh", "-c" ]
RUN set -ex; \
  [ "$(command -v corepack)" = "/usr/local/bin/corepack" ] && echo "works" || exit 1;


USER root

# don't update!!
RUN install-tool corepack 0.9.0

RUN corepack --version | tee | grep '0.9.0'

USER 12021

# renovate: datasource=npm
RUN install-tool corepack 0.29.4

RUN corepack --version
RUN corepack --version | grep '0.9.0' && exit 1 || echo 'success'

RUN set -ex; \
  [ "$(command -v pnpm)" = "/usr/local/bin/pnpm" ] && echo "works" || exit 1; \
  [ "$(command -v pnpx)" = "/usr/local/bin/pnpx" ] && echo "works" || exit 1; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  [ "$(command -v yarnpkg)" = "/usr/local/bin/yarnpkg" ] && echo "works" || exit 1;

#--------------------------------------
# test: yarn (corepack)
#--------------------------------------
FROM build AS testm

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool corepack 0.29.4

# renovate: datasource=npm depName=yarn
ARG YARN_VERSION=1.22.22

RUN set -ex; cd a; \
  npm pkg set packageManager=yarn@${YARN_VERSION}; \
  yarn -v | tee | grep ${YARN_VERSION}; \
  yarn install

#--------------------------------------
# test: yarn v3 (corepack)
#--------------------------------------
FROM build AS testn

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool corepack 0.29.4

# test if corepack is overriding yarn
# renovate: datasource=npm
RUN install-tool yarn 1.22.22

# renovate: datasource=npm
RUN install-tool corepack 0.29.4


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
FROM build AS testo

SHELL [ "/bin/sh", "-c" ]

# renovate: datasource=npm
RUN install-tool corepack 0.29.4

# test if corepack is overriding pnpm
# renovate: datasource=npm
RUN install-tool pnpm 9.11.0

# renovate: datasource=npm
RUN install-tool corepack 0.29.4

# renovate: datasource=npm depName=pnpm
ARG PNPM_VERSION=9.11.0

RUN set -ex; cd a; \
  npm pkg set packageManager=pnpm@${PNPM_VERSION}; \
  pnpm -v | tee | grep ${PNPM_VERSION}; \
  pnpm install

#--------------------------------------
# test: pnpm / yarn (link / wrapper overrides)
#--------------------------------------
FROM build AS testp

ARG PNPM_VERSION=6.0.0
ARG YARN_VERSION=1.22.0
ARG YARN_SLIM_VERSION=1.22.5

ENV URL_REPLACE_0_FROM=https://registry.npmjs.org/
ENV URL_REPLACE_0_TO=https://registry.yarnpkg.com/

RUN install-tool pnpm
RUN install-tool yarn
RUN install-tool yarn-slim

# renovate: datasource=npm
RUN install-tool corepack 0.29.4

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
FROM base AS testq

RUN prepare-tool node

# install latest version
RUN install-tool node
RUN install-tool yarn
RUN install-npm del-cli

# renovate: datasource=npm depName=renovate
ARG RENOVATE_VERSION=38.101.1
RUN install-tool renovate

RUN set -ex; \
  renovate --version; \
  renovate-config-validator; \
  export NODE_VERSION=$(cat /opt/containerbase/versions/node); \
  ln -sf /opt/containerbase/tools/renovate/${RENOVATE_VERSION}/${NODE_VERSION}/node_modules ./node_modules; \
  node -e "new require('re2')('.*').exec('test'); console.log('re2 usable')"; \
  true


RUN set -ex; \
  install-npm @microsoft/rush; \
  rush -h; \
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
