ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

RUN touch /.dummy

# test openshift compatibility 1000<>1001
COPY --chown=1001:0 test test

WORKDIR /test

#--------------------------------------
# test: erlang (root)
#--------------------------------------
FROM build as testa

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# renovate: datasource=github-releases lookupName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 25.0.0.0

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.13.4


USER 1001

RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (user,openshift)
#--------------------------------------
FROM build as testb

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool erlang

USER 1001

# renovate: datasource=github-releases lookupName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 25.0.0.0

ARG BUILDPACK_DEBUG

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.13.4


RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# final
#--------------------------------------
FROM build

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
