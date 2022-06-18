FROM containerbase/node:16.15.1@sha256:b0959887b15cd3144dabd38473f5074a75fbe5a18ec2e6ba5a469f30c79fbe7e

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
