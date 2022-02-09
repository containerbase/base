ARG IMAGE=containerbase/buildpack
ARG BUILDPACK_DEBUG

FROM ${IMAGE} as build

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# renovate: datasource=node
RUN install-tool node v16.14.0

RUN touch /.dummy

USER 1000

COPY --chown=1000:0 test test

WORKDIR /test

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
RUN install-tool yarn 1.22.17

# renovate: datasource=npm
RUN install-tool lerna 4.0.0

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
RUN install-tool pnpm 6.24.4

RUN set -ex; \
  pnpm --version;


RUN set -ex; cd a; pnpm i


SHELL [ "/bin/sh", "-c" ]
RUN set -ex; \
  pnpm --version \
  [ "$(command -v pnpm)" = "/home/user/bin/pnpm" ] && echo "works" || exit 1;

#--------------------------------------
# test: node 17
#--------------------------------------

FROM ${IMAGE} as testd

ARG APT_HTTP_PROXY

RUN touch /.dummy

USER 1000

# renovate: datasource=node
RUN install-tool node v17.0.1

RUN npm install -g yarn
RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/.npm-global/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;

# renovate: datasource=npm
RUN install-tool yarn 1.22.17
RUN set -ex; \
  [ "$(command -v yarn)" = "/home/${USER_NAME}/bin/yarn" ] && echo "works" || exit 1; \
  yarn --version;


COPY --chown=1000:0 test test

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

# renovate: datasource=npm lookupName=yarn
RUN install-tool yarn-slim 1.22.17

RUN set -ex; yarn-slim --version
RUN set -ex; cd a; yarn-slim install

#--------------------------------------
# test: npm (install-tool npm, node v14)
#--------------------------------------
FROM ${IMAGE} as testi

ARG BUILDPACK_DEBUG

# don't update!!
RUN install-tool node v14.18.1
RUN install-tool node v14.18.2

RUN cat $USER_HOME/.npmrc | grep "prefix = \"$USER_HOME/.npm-global\""

RUN touch /.dummy

USER 1000

COPY --chown=1000:0 test test

WORKDIR /test

# don't update!!
RUN install-tool npm 6.14.15

RUN node --version
RUN npm --version
RUN npm --version | grep '6.14.15'
RUN set -ex; cd a; npm install

#--------------------------------------
# final
#--------------------------------------
FROM ${IMAGE}

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
COPY --from=testg /.dummy /.dummy
COPY --from=testh /.dummy /.dummy
COPY --from=testi /.dummy /.dummy
