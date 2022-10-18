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

# https://hexdocs.pm/elixir/1.14.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 25.1.1.0

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.14.1


USER 1001

RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (v24,user,openshift)
#--------------------------------------
FROM build as testb

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool erlang

USER 1001

# https://hexdocs.pm/elixir/1.14.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# no major update, pin elixir if newer version doesn't support v24
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 24.3.4.6

ARG BUILDPACK_DEBUG

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.14.1


RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (v22,user,openshift)
#--------------------------------------
FROM build as testc

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN prepare-tool erlang

USER 1001

# https://hexdocs.pm/elixir/1.13.4/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# no major update, pin elixir if newer version doesn't support v22
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 22.3.4.26

ARG BUILDPACK_DEBUG

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
COPY --from=testc /.dummy /.dummy
