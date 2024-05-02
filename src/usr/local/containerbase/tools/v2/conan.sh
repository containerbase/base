#!/bin/bash

export NEEDS_PREPARE=1

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function get_architecture() {
  local architecture
  architecture="$(uname -p)"
  
  case $architecture in
  "x86_64") echo "$architecture" ;;
  "aarch64") echo "$architecture" ;;
  *)
    echo "Architecture not supported: ${architecture}! Please use 'x86_64' or 'aarch64'." >&2
    return 1
   ;;
  esac
}

function get_distribution() {
  local distribution
  distribution="$(get_distro)"

  case $distribution in
  "focal") echo "$distribution" ;;
  "jammy") echo "$distribution" ;;
  "noble") echo "$distribution" ;;
  *)
    echo "Distribution not supported: ${distribution}! Please use 'focal', 'jammy' or 'noble'." >&2
    return 1
   ;;
  esac
}

function create_conan_profile() {
  local architecture=$1
  local compiler_version=$2

  echo "[settings]
        arch=${architecture}
        build_type=Release
        compiler=gcc
        compiler.cppstd=gnu17
        compiler.libcxx=libstdc++11
        compiler.version=${compiler_version}
        os=Linux"
}

function set_conan_profile() {
  local architecture=$1
  case "${architecture}" in
    "x86_64")
      architecture="x86_64"
      ;;
    "aarch64")
      architecture="armv8"
      ;;
  esac

  local compiler_version
  local distribution=$2
  case "${distribution}" in
    "focal")
      compiler_version="9"
      ;;
    "jammy")
      compiler_version="11"
      ;;
    "noble")
      compiler_version="13"
      ;;
  esac

  if [[ ! -f "${USER_HOME}/.conan2/profiles/default" ]]; then
    mkdir -p "${USER_HOME}/.conan2/profiles" > /dev/null
    touch "${USER_HOME}/.conan2/profiles/default"
    chown -R "${USER_NAME}" "${USER_HOME}/.conan2"
    chmod -R g+w "${USER_HOME}/.conan2"
  fi

  create_conan_profile "${architecture}" "${compiler_version}" > "${USER_HOME}/.conan2/profiles/default"
}

function prepare_tool () {
  local architecture
  architecture="$(get_architecture)"
  if [[ "${architecture}" == "1" ]]; then
    return 1
  fi

  local distribution
  distribution="$(get_distribution)"
  if [[ "${distribution}" == "1" ]]; then
    return 1
  fi

  set_conan_profile "${architecture}" "${distribution}"

  apt_install gcc g++ make cmake perl

  create_tool_path > /dev/null
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || conan --version
}
