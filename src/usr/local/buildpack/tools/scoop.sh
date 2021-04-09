#!/bin/bash

set -e

if [[ -d "/usr/local/scoop/${SCOOP_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

mkdir -p /usr/local/scoop/${SCOOP_VERSION}
curl -sSL https://github.com/lukesampson/scoop/archive/${SCOOP_VERSION}.tar.gz --output scoop.tgz
tar --strip 1 -C /usr/local/scoop/${SCOOP_VERSION} -xzf scoop.tgz
rm scoop.tgz

export_path /usr/local/scoop/${SCOOP_VERSION}/bin
