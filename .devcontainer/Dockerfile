FROM containerbase/node:18.14.0@sha256:303dfd32b89b293bcd53f3685edcf22576443bc35a61cedc911b1ac88882c711

# renovate: datasource=npm
RUN install-tool corepack 0.15.3

USER root
RUN install-apt shellcheck
USER 1000
