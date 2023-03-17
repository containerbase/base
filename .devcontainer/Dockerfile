FROM containerbase/node:18.15.0@sha256:85f7a978d6273bda9942b95f477322d4e3627d57008f93fa3927377f5e808568

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
