#!/bin/bash

set -e

require_root
groupadd -g 999 docker
usermod -aG docker ${USER_NAME}

curl -sSL https://download.docker.com/linux/static/stable/x86_64/docker-${TOOL_VERSION}.tgz -o docker.tgz
tar xzvf docker.tgz --strip 1 -C /usr/local/bin docker/docker
rm docker.tgz

docker --version
