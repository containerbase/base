#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})

echo "deb http://ppa.launchpad.net/ondrej/php/ubuntu ${VERSION_CODENAME} main" | tee /etc/apt/sources.list.d/ondrej-php.list
curl -sSL \
  'http://keyserver.ubuntu.com/pks/lookup?op=get&search=0x14AA40EC0831756756D7F66C4F4EA0AAE5267A6C' \
  | apt-key add -

VERSION=${MAJOR}.${MINOR}
packages="php${VERSION}-cli php${VERSION}-mbstring php${VERSION}-curl php${VERSION}-xml"

if [ "${MAJOR}" -lt "8" ]; then
  packages="${packages} php${VERSION}-json"
fi

apt_install $packages


php -v
