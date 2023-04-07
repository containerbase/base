#!/bin/bash

function prepare_tool() {
  local version_codename
  local tool_path

  version_codename="$(get_distro)"
  case "${version_codename}" in
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
        uuid-dev \
        zlib1g-dev \
        ;;
    "jammy")
      apt_install \
        binutils \
        gnupg2 \
        libc6-dev \
        libcurl4-openssl-dev \
        libedit2 \
        libgcc-9-dev \
        libpython3.8 \
        libsqlite3-0 \
        libstdc++-9-dev \
        libxml2-dev \
        libz3-dev \
        pkg-config \
        tzdata \
        unzip \
        zlib1g-dev \
        ;;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac

  create_tool_path > /dev/null
}

function install_tool () {
  local arch
  local tool_path
  local file
  local SWIFT_PLATFORM
  local SWIFT_BRANCH
  local SWIFT_VER
  local SWIFT_WEBROOT
  local SWIFT_WEBDIR
  local VERSION_ID
  local version_codename
  local versioned_tool_path
  local version=$TOOL_VERSION

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi


  # shellcheck source=/dev/null
  VERSION_ID=$(. /etc/os-release && echo "${VERSION_ID}")

  # https://download.swift.org/swift-5.7-release/ubuntu2204/swift-5.7-RELEASE/swift-5.7-RELEASE-ubuntu22.04.tar.gz
  # https://download.swift.org/swift-5.7.3-release/ubuntu2204/swift-5.7.3-RELEASE/swift-5.7.3-RELEASE-ubuntu22.04.tar.gz
  # https://download.swift.org/swift-5.7.3-release/ubuntu2204-aarch64/swift-5.7.3-RELEASE/swift-5.7.3-RELEASE-ubuntu22.04-aarch64.tar.gz
  if [[ "${PATCH}" = "0" ]]; then
    version=${MAJOR}.${MINOR}
  fi

  if [[ "${ARCHITECTURE}" = "aarch64" ]]; then
    arch=-${ARCHITECTURE}
  fi

  SWIFT_PLATFORM=ubuntu${VERSION_ID}${arch}
  SWIFT_BRANCH=swift-${version}-release
  SWIFT_VER=swift-${version}-RELEASE
  SWIFT_WEBROOT=https://download.swift.org

  SWIFT_WEBDIR="$SWIFT_WEBROOT/$SWIFT_BRANCH/$(echo "$SWIFT_PLATFORM" | tr -d .)"

  file=$(get_from_url "$SWIFT_WEBDIR/$SWIFT_VER/$SWIFT_VER-$SWIFT_PLATFORM.tar.gz")

  versioned_tool_path=$(create_versioned_tool_path)
  bsdtar --strip 2 -C "${versioned_tool_path}" -xzf "${file}"
}

function link_tool () {
  local tool_path

  tool_path=$(find_versioned_tool_path)

  shell_wrapper "$TOOL_NAME" "$tool_path/bin"

  SKIP_VERSION || swift --version
}
