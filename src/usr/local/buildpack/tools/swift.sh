#!/bin/bash

set -e

require_root
check_semver $TOOL_VERSION

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

SWIFT_INSTALL_DIR=/usr/local/swift/${TOOL_VERSION}

if [[ -d "${SWIFT_INSTALL_DIR}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi


VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})
VERSION_ID=$(. /etc/os-release && echo ${VERSION_ID})

# https://swift.org/getting-started/#on-linux
# already installed: git

case "$VERSION_CODENAME" in
  "bionic")
    apt_install \
      binutils \
      libc6-dev \
      libcurl4 \
      libedit2 \
      libgcc-5-dev \
      libpython2.7 \
      libsqlite3-0 \
      libstdc++-5-dev \
      libxml2 \
      pkg-config \
      tzdata \
      zlib1g-dev \
    ;;
  "focal")
    apt_install \
      binutils \
      gnupg2 \
      libc6-dev \
      libcurl4 \
      libedit2 \
      libgcc-9-dev \
      libpython2.7 \
      libsqlite3-0 \
      libstdc++-9-dev \
      libxml2 \
      libz3-dev \
      pkg-config \
      tzdata \
      zlib1g-dev \
    ;;
esac


# https://swift.org/builds/swift-5.3-release/ubuntu1804/swift-5.3-RELEASE/swift-5.3-RELEASE-ubuntu20.04.tar.gz
if [[ "${PATCH}" = "0" ]]; then
  TOOL_VERSION=${MAJOR}.${MINOR}
fi

SWIFT_PLATFORM=ubuntu${VERSION_ID}
SWIFT_BRANCH=swift-${TOOL_VERSION}-release
SWIFT_VER=swift-${TOOL_VERSION}-RELEASE
SWIFT_WEBROOT=https://swift.org/builds

SWIFT_WEBDIR="$SWIFT_WEBROOT/$SWIFT_BRANCH/$(echo $SWIFT_PLATFORM | tr -d .)"
SWIFT_BIN_URL="$SWIFT_WEBDIR/$SWIFT_VER/$SWIFT_VER-$SWIFT_PLATFORM.tar.gz"


mkdir -p $SWIFT_INSTALL_DIR

curl -fsSL $SWIFT_BIN_URL -o swift.tar.gz
tar --strip 2 -C $SWIFT_INSTALL_DIR -xzf swift.tar.gz
rm swift.tar.gz

export_path "${SWIFT_INSTALL_DIR}/bin"

swift --version

shell_wrapper swift
