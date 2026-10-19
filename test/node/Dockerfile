ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:24.04 AS containerbase

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
RUN install-tool node 24.22.0

# ensure npmrc is writable by user
RUN set -ex; [ $(stat --format '%u' "/tmp/containerbase/cache/.npmrc") -eq ${USER_ID} ]

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
RUN install-tool yarn 4.18.1

# renovate: datasource=npm packageName=@yarnpkg/yarn-x86_64-unknown-linux-musl
ARG YARN_VERSION=6.0.0-rc.19

RUN install-tool yarn "${YARN_VERSION}"

RUN test "$(yarn --version)" = "${YARN_VERSION}"

#--------------------------------------
# test: pnpm
#--------------------------------------

FROM build AS testc

# renovate: datasource=npm
RUN install-tool pnpm 12.12.1

RUN set -ex; \
  pnpm --version;

SHELL [ "/bin/sh", "-c" ]

# pnpm 11+ fails on unreviewed build scripts, skip them like older versions did
RUN set -ex; cd a; \
  printf 'allowBuilds:\n  re2: false\n' > pnpm-workspace.yaml; \
  pnpm i

#--------------------------------------
# test: node 20
#--------------------------------------

FROM base AS test-v20

RUN prepare-tool node

USER 12021

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 20.20.2

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
RUN install-npm del-cli 7.0.0
RUN del -d test/a/**

#--------------------------------------
# test: node 22
#--------------------------------------

FROM base AS test-v22

RUN prepare-tool node

USER 12021

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 22.23.3

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
RUN install-npm del-cli 7.0.0
RUN del -d test/a/**

#--------------------------------------
# test: node partial version
#--------------------------------------

FROM base AS test-partial

RUN prepare-tool node

USER 12021

RUN install-tool node 22

RUN set -ex; \
  node --version | grep '^v22\.';

RUN install-tool pnpm 10

RUN set -ex; \
  pnpm --version | grep '^10\.';

RUN install-tool yarn 4

RUN set -ex; \
  yarn --version | grep '^4\.';

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
# test: npm (install-tool npm v6, node v14, including node-gyp update)
#--------------------------------------
FROM base AS testi

ARG CONTAINERBASE_DEBUG

# exercises https://github.com/containerbase/base/issues/5404
ARG npm_config_build_from_source=true

# don't update!!
RUN install-tool node v14.18.1
ARG NODE_VERSION=14.18.2
RUN install-tool node "v${NODE_VERSION}"

# verify global node-gyp was updated
ARG EXPECTED_NODE_GYP_ABOVE=11.0.0
RUN set -ex; \
  node_gyp_version=$(npm explore npm -g -- npm ls node-gyp --json | jq -er '.dependencies["npm-lifecycle"].dependencies["node-gyp"].version'); \
  printf '%s\n' "${EXPECTED_NODE_GYP_ABOVE}" "${node_gyp_version}" | sort -V | head -n1 | grep -q "^${EXPECTED_NODE_GYP_ABOVE}$"

RUN set -ex; ls -la $USER_HOME/; test -L $USER_HOME/.npmrc

RUN touch /.dummy

USER 12021

COPY --chown=12021:0 test/node/test test
WORKDIR /test

# don't update!!
ARG NPM_VERSION=6.14.15
RUN install-tool npm "${NPM_VERSION}"

RUN node --version
RUN npm --version
RUN npm --version | grep "${NPM_VERSION}"

# verify local node-gyp was updated
RUN set -ex; \
  prefix="/opt/containerbase/tools/npm/${NPM_VERSION}/${NODE_VERSION}"; \
  node_gyp_version=$(npm explore npm --prefix "${prefix}" -- npm ls node-gyp --json | jq -er '.dependencies["npm-lifecycle"].dependencies["node-gyp"].version'); \
  printf '%s\n' "${EXPECTED_NODE_GYP_ABOVE}" "${node_gyp_version}" | sort -V | head -n1 | grep -q "^${EXPECTED_NODE_GYP_ABOVE}$"


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

RUN install-tool npm "${NPM_VERSION}"

RUN node --version
RUN npm --version
RUN npm --version | grep "${NPM_VERSION}"

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
RUN install-tool corepack 0.36.0

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
RUN install-tool corepack 0.36.0

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
RUN install-tool corepack 0.36.0

# test if corepack is overriding yarn
# renovate: datasource=npm
RUN install-tool yarn 1.22.22

# renovate: datasource=npm
RUN install-tool corepack 0.36.0


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
RUN install-tool corepack 0.36.0

# test if corepack is overriding pnpm
# renovate: datasource=npm
RUN install-tool pnpm 12.12.1

# renovate: datasource=npm
RUN install-tool corepack 0.36.0

# corepack can't run pnpm 11+, which no longer ships `bin/pnpm.cjs`
# renovate: datasource=npm depName=pnpm-corepack packageName=pnpm
ARG PNPM_VERSION=10.34.6

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
# no cdn, it is applied before the url replacements and would bypass them
ENV CONTAINERBASE_CDN=

RUN install-tool pnpm
RUN install-tool yarn
RUN install-tool yarn-slim

# renovate: datasource=npm
RUN install-tool corepack 0.36.0

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
# test: renovate (rootless,readonly,uninstall)
#--------------------------------------
FROM base AS testq

RUN set -ex; \
  ls -la /opt/containerbase; \
  ls -la /tmp/containerbase; \
  ls -la /tmp/containerbase/cache; \
  true

RUN prepare-tool node

# emulate empty containerbase folders
RUN set -ex; \
  ls -la /tmp/containerbase/cache; \
  rm -rf /opt/containerbase/*; \
  ls -la /opt/containerbase/; \
  rm -rf /tmp/*; \
  ls -la /tmp/; \
  ls -la /var/lib/containerbase/; \
  cat /var/lib/containerbase/tool.prep; \
  true

USER 1000

RUN [[ ! -d /tmp/containerbase ]] || (echo "/tmp/containerbase should not exist"; exit 1 )
RUN containerbase-cli init tool all
RUN [[ -d /tmp/containerbase ]] || (echo "/tmp/containerbase should exist"; exit 1)
RUN rm -rf /tmp/*;

# install latest version
RUN install-tool node
RUN install-tool yarn
RUN install-npm del-cli

# renovate: datasource=npm depName=renovate
ARG RENOVATE_VERSION=44.151.2
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

RUN set -ex; \
  ls -la /usr/local/bin/;\
  containerbase-cli list tools --out /tmp/tools-before.txt; \
  cat /tmp/tools-before.txt; \
  grep -q '^node ' /tmp/tools-before.txt; \
  grep -q '^yarn ' /tmp/tools-before.txt; \
  grep -q '^renovate ' /tmp/tools-before.txt; \
  containerbase-cli list tools --json --out /tmp/tools-before.json; \
  cat /tmp/tools-before.json; \
  grep -q '"name":"del-cli"' /tmp/tools-before.json; \
  uninstall-tool node -a -r; \
  ls -la /usr/local/bin/;\
  if [ -n "$(ls -A /usr/local/bin/)" ]; then echo "tools not uninstalled" >&2; exit 1; fi;\
  containerbase-cli list tools --out /tmp/tools-after.txt; \
  cat /tmp/tools-after.txt; \
  grep -q 'No tools installed.' /tmp/tools-after.txt; \
  true

#--------------------------------------
# test: custom tmp dir
#--------------------------------------
FROM build AS test-tmp-dir

USER root
ENV CONTAINERBASE_TMP_DIR=/var/cache/containerbase

# init at build time moves the folder of the base image into the configured one
RUN set -ex; \
  [[ -d /tmp/containerbase && ! -L /tmp/containerbase ]]; \
  containerbase-cli init tool node; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]; \
  [[ -d /var/cache/containerbase/cache/.npm ]]; \
  [[ -f /var/cache/containerbase/cache/.npmrc ]]; \
  [[ -d /var/cache/containerbase/cache/.cache ]]; \
  rm /var/cache/containerbase/tool.init.d/node

# a boot with an empty /tmp only links the configured folder and skips init
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  docker-entrypoint.sh true; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]; \
  [[ ! -e /var/cache/containerbase/tool.init.d/node ]]; \
  [[ -d $USER_HOME/.npm ]]

# the fast path also takes a value with a trailing slash and keeps it
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  out=$(CONTAINERBASE_TMP_DIR=/var/cache/containerbase/ docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "${out}" == "tmp=/var/cache/containerbase/" ]]; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]; \
  [[ ! -e /var/cache/containerbase/tool.init.d/node ]]

# a boot with an empty mounted folder links and initializes it
RUN set -ex; \
  find /var/cache/containerbase -mindepth 1 -delete; \
  rm -rf /tmp/containerbase; \
  docker-entrypoint.sh true; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]; \
  [[ -d /var/cache/containerbase/tool.init.d ]]; \
  [[ -d $USER_HOME/.npm ]]

# a boot replaces a link to another folder
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  ln -s /var/tmp /tmp/containerbase; \
  docker-entrypoint.sh true; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]

# a tool wrapper without the entrypoint recreates a missing link
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  node --version; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]

# an invalid value at boot goes through the cli, which warns once and uses the default
RUN set -ex; \
  out=$(CONTAINERBASE_TMP_DIR=relative/tmp docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "$(grep -c 'Ignoring invalid CONTAINERBASE_TMP_DIR' <<< "${out}")" -eq 1 ]]; \
  [[ "${out}" == *"tmp=/tmp/containerbase"* ]]; \
  out=$(CONTAINERBASE_TMP_DIR=// docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "$(grep -c 'Ignoring invalid CONTAINERBASE_TMP_DIR' <<< "${out}")" -eq 1 ]]; \
  [[ "${out}" == *"tmp=/tmp/containerbase"* ]]

# a configured link into /tmp skips the fast path, the cli warns and keeps the default
RUN set -ex; \
  mkdir -p /tmp/somewhere/tool.init.d; \
  ln -s /tmp/somewhere /var/cache/cb-link; \
  out=$(CONTAINERBASE_TMP_DIR=/var/cache/cb-link docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "${out}" == *"keeping the default folder"* ]]; \
  [[ "${out}" == *"tmp=/tmp/containerbase"* ]]; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/containerbase ]]

# a non-root boot with a configured folder it can't create keeps a real default folder
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  mkdir -m 755 /var/cache/root-only

USER 12021

RUN set -ex; \
  export CONTAINERBASE_TMP_DIR=/var/cache/root-only/containerbase; \
  out=$(docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "${out}" == *"keeping the default folder"* ]]; \
  [[ "${out}" == *"tmp=/tmp/containerbase"* ]]; \
  [[ -d /tmp/containerbase && ! -L /tmp/containerbase ]]; \
  containerbase-cli init tool node; \
  [[ -f /tmp/containerbase/tool.init.d/node ]]

USER root

# a non-root boot with a root owned link to another folder keeps that link
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  mkdir -m 777 /var/tmp/other; \
  ln -s /var/tmp/other /tmp/containerbase

USER 12021

RUN set -ex; \
  out=$(docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "${out}" == *"keeping the default folder"* ]]; \
  [[ "${out}" == *"tmp=/tmp/containerbase"* ]]; \
  [[ "$(readlink /tmp/containerbase)" == /var/tmp/other ]]; \
  [[ -f /var/tmp/other/tool.init.d/node ]]

USER root

# a non-root boot on a root owned default folder keeps using that folder without moving it
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  mkdir -m 775 /tmp/containerbase; \
  touch /tmp/containerbase/marker

USER 12021

RUN set -ex; \
  out=$(docker-entrypoint.sh bash -c 'echo "tmp=${CONTAINERBASE_TMP_DIR}"' 2>&1); \
  echo "${out}"; \
  [[ "${out}" == *"keeping the default folder"* ]]; \
  [[ "${out}" == *"tmp=/tmp/containerbase"* ]]; \
  containerbase-cli init tool node; \
  [[ -d /tmp/containerbase && ! -L /tmp/containerbase ]]; \
  [[ -f /tmp/containerbase/marker ]]; \
  [[ ! -e /var/cache/containerbase/marker ]]; \
  [[ -f /tmp/containerbase/tool.init.d/node ]]

USER root

# a root owned configured folder created before the switch is given to the user
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  mkdir -m 755 /var/cache/pre; \
  CONTAINERBASE_TMP_DIR=/var/cache/pre containerbase-cli init tool node; \
  [[ "$(readlink /tmp/containerbase)" == /var/cache/pre ]]; \
  [[ "$(stat --format '%u' /var/cache/pre)" -eq 12021 ]]

USER 12021

RUN set -ex; \
  touch "${USER_HOME}/.npm/user-write"; \
  [[ -f /var/cache/pre/cache/.npm/user-write ]]

USER root

# without a configured folder a non-root boot replaces a leftover link to a folder it can't write
RUN set -ex; \
  rm -rf /tmp/containerbase; \
  mkdir -m 755 /var/cache/root-ro

USER 12021

RUN set -ex; \
  ln -s /var/cache/root-ro /tmp/containerbase; \
  env -u CONTAINERBASE_TMP_DIR docker-entrypoint.sh true; \
  [[ -d /tmp/containerbase && ! -L /tmp/containerbase ]]; \
  [[ -d /tmp/containerbase/tool.init.d ]]

#--------------------------------------
# test: vp
#--------------------------------------
FROM build AS test-vp

USER root

# renovate: datasource=github-releases depName=vp packageName=voidzero-dev/vite-plus
ARG VP_VERSION=1.2.0
RUN install-tool vp "${VP_VERSION}"

COPY test/node/vp/sync-versions.mjs /test/vp/

USER 12021
SHELL ["/bin/sh", "-c"]

RUN set -ex; \
  vp --version | grep "${VP_VERSION}";

RUN node /test/vp/sync-versions.mjs "${VP_VERSION}"

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
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
COPY --from=test-tmp-dir /.dummy /.dummy
COPY --from=test-vp /.dummy /.dummy

COPY --from=test-v20 /.dummy /.dummy
COPY --from=test-v22 /.dummy /.dummy
COPY --from=test-partial /.dummy /.dummy
