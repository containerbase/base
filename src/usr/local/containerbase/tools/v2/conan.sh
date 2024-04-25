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
  *)
    echo "Distribution not supported: ${distribution}! Please use 'focal' or 'jammy'." >&2
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
        compiler.libcxx=libstdc++
        compiler.version=${compiler_version}
        os=Linux"
}

function set_conan_profile() {
  if [[ ! -f "${USER_HOME}/.conan2/profiles/default" ]]; then
    mkdir -p "${USER_HOME}/.conan2/profiles" > /dev/null
    touch "${USER_HOME}/.conan2/profiles/default"
    chown -R "${USER_NAME}" "${USER_HOME}/.conan2"
    chmod -R g+w "${USER_HOME}/.conan2"
  fi

  local architecture_distribution=$1
  case "${architecture_distribution}" in
    "x86_64-focal")
      create_conan_profile "x86_64" "9" > "${USER_HOME}/.conan2/profiles/default"
      ;;
    "aarch64-focal")
      create_conan_profile "armv8" "9" > "${USER_HOME}/.conan2/profiles/default"
      ;;
    "x86_64-jammy")
      create_conan_profile "x86_64" "11" > "${USER_HOME}/.conan2/profiles/default"
      ;;
    "aarch64-jammy")
      create_conan_profile "armv8" "11" > "${USER_HOME}/.conan2/profiles/default"
      ;;
  esac
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

  apt_install gcc make cmake perl

  set_conan_profile "${architecture}-${distribution}"

  create_tool_path > /dev/null
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || conan --version
}
