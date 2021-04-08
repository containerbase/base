ARG IMAGE=containerbase/buildpack
FROM ${IMAGE}

# Flutter

RUN install-tool flutter 1.12.13+hotfix.9

USER 1000


COPY --chown=1000:0 test test


RUN set -ex; \
    cd test/a; \
    flutter pub upgrade;

RUN set -ex; \
    cd test/b; \
    flutter pub upgrade;
