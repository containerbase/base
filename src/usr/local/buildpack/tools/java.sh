#!/bin/bash

set -e

require_root
check_semver $TOOL_VERSION

VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})

echo "deb http://ppa.launchpad.net/openjdk-r/ppa/ubuntu ${VERSION_CODENAME} main" | tee /etc/apt/sources.list.d/java.list
curl -sSL \
  'http://keyserver.ubuntu.com/pks/lookup?op=get&search=0xDA1A4A13543B466853BAF164EB9B1D8886F44E2A' \
  | apt-key add -

apt_install openjdk-${MAJOR}-jdk-headless

java -version
