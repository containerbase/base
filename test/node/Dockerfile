ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

ARG APT_HTTP_PROXY

# renovate: datasource=node
RUN install-tool node 14.17.6

RUN touch /.dummy

WORKDIR /tmp

USER 1000

COPY --chown=1000:0 test test

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

#--------------------------------------
# test: yarn
#--------------------------------------
FROM build as testb

ARG APT_HTTP_PROXY

RUN npm install -g yarn

RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;


RUN set -ex; cd test/a; yarn

ENV NPM_CONFIG_PREFIX=/tmp/.npm
RUN npm install -g yarn

RUN set -ex; \
  [ "$(command -v yarn)" = "/tmp/.npm/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;


SHELL [ "/bin/sh", "-c" ]

USER root

# renovate: datasource=npm
RUN install-tool yarn 1.22.15

# renovate: datasource=npm
RUN install-npm lerna 4.0.0

USER 1000

RUN set -ex; \
  [ "$(command -v yarn)" = "/usr/local/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version

#--------------------------------------
# test: pnpm
#--------------------------------------

FROM build as testc

ARG APT_HTTP_PROXY

USER root

# renovate: datasource=npm
RUN install-tool pnpm 6.16.0

USER 1000


RUN set -ex; \
  pnpm --version;


RUN set -ex; cd test/a; pnpm i


SHELL [ "/bin/sh", "-c" ]
RUN set -ex; \
  pnpm --version \
  [ "$(command -v pnpm)" = "/usr/local/bin/pnpm" ] && echo "works" || exit 1;

#--------------------------------------
# test: node 15
#--------------------------------------

FROM ${IMAGE} as testd

ARG APT_HTTP_PROXY

# renovate: datasource=node
RUN install-tool node 15.0.1

RUN touch /.dummy

# renovate: datasource=npm
RUN install-tool yarn 1.22.15

USER 1000

COPY --chown=1000:0 test test

RUN set -ex; \
  npm --version; \
  command -v npm;


RUN set -ex; cd test/a; npm i

RUN npm install -g yarn
RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;

RUN mkdir -p /tmp/.npm/{bin,lib}
ENV NPM_CONFIG_PREFIX=/tmp/.npm
RUN npm install -g yarn

RUN set -ex; \
  [ "$(command -v yarn)" = "/tmp/.npm/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;

#--------------------------------------
# final
#--------------------------------------
FROM ${IMAGE}

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
