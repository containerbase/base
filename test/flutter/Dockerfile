ARG IMAGE=renovate/buildpack
FROM ${IMAGE}

# Flutter

RUN install-tool flutter 1.12.13+hotfix.9

USER ubuntu


COPY --chown=ubuntu:0 test test


RUN set -ex; \
    cd test/a; \
    flutter pub upgrade;

RUN set -ex; \
    cd test/b; \
    flutter pub upgrade;
