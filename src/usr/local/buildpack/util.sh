#!/bin/bash

# get path location
DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

# source the helper files
# shellcheck source=/dev/null
. "${DIR}/utils/constants.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/environment.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/filesystem.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/linking.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/cache.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/version.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/install.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/prepare.sh"

check_debug() {
  local bool="${CONTAINERBASE_DEBUG:-${BUILDPACK_DEBUG:-false}}"
  # comparison is performed without regard to the case of alphabetic characters
  shopt -s nocasematch
  if [[ "$bool" = 1 || "$bool" =~ ^(yes|true)$ ]]; then
    set -x
  fi
}
check_debug

if [[ -z "${CONTAINERBASE_ENV+x}" ]]; then
  refreshenv
fi

function check_version () {
  echo "Function 'check_version' is deprecated, use 'require_tool' instead." >&2
  local VERSION_PREFIX="^v?(.+)"
  if [[ -z ${!1+x} ]]; then
    echo "No ${1} defined - aborting: ${!1}"
    exit 1
  elif [[ "${!1}" =~ ${VERSION_PREFIX} ]]; then
    # trim leading v
    export "$1=${BASH_REMATCH[1]}"
  fi
}

function check_command () {
  if [[ ! -x $(command -v "${1}") ]]; then
    echo "No ${1} defined - aborting" >&2
    exit 1
  fi
}


SEMVER_REGEX="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\+[0-9]+)?([a-z-].*)?$"

# will extract the given version into MAJOR, MINOR and PATCH components
# the optional second argument gives the highest component required.
# Possible values are none (default), major, minor, patch or all (same as patch)
# which requires at least the given component to be set
function check_semver () {
  local version=${1}
  local lowest_component=${2:-none}

  if [[ ! "${version}" =~ ${SEMVER_REGEX} ]]; then
    echo Not a semver like version - aborting: "${version}"
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}

  if [[ ! "${lowest_component}" =~ all|major|minor|patch ]]; then
    return
  elif [[ "${lowest_component}" =~ all|major|minor|patch ]] && [[ ! "${MAJOR}" ]]; then
    echo Invalid version - Major not defined: "${version}"
    exit 1
  elif [[ "${lowest_component}" =~ all|minor|patch ]] && [[ ! "${MINOR}" ]]; then
    echo Invalid version - Minor not defined: "${version}"
    exit 1
  elif [[ "${lowest_component}" =~ all|patch ]] && [[ ! "${PATCH}" ]]; then
    echo Invalid version - Patch not defined: "${version}"
    exit 1
  fi
}

function apt_install () {
  local packages=()

  for pkg in "$@"
  do
    if ! dpkg -s "${pkg}" 2> /dev/null | grep -s -q "Status: install" > /dev/null
    then
      packages+=("${pkg}")
    fi
  done

  if [[ ${#packages[@]} -eq 0 ]]
  then
    echo "No packages to install"
    return
  fi

  echo "Installing apt packages: ${packages[*]}"
  if [[ "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get -qq install -y "${packages[@]}"

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}

function apt_upgrade () {
  echo "Upgrading apt packages"
  if [[ "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get -qq upgrade -y

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}


function require_arch () {
  local arch
  # shellcheck source=/dev/null
  arch=$(uname -p)
  case "$arch" in
  "x86_64") ;; #supported
  "aarch64") ;; #supported
  *)
    echo "Arch not supported: ${arch}! Please use 'x86_64' or 'aarch64'." >&2
    exit 1
   ;;
  esac
}

function require_distro () {
  local VERSION_CODENAME
  # shellcheck source=/dev/null
  VERSION_CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  case "$VERSION_CODENAME" in
  "focal") ;; #supported
  "jammy") #supported (partial)
    echo "WARNING: Not all tools are yet supported!" >&2
    echo "  -> https://github.com/containerbase/base/issues/361" >&2
    ;;
  *)
    echo "Distro not supported: ${VERSION_CODENAME}! Please use ubuntu 'focal' or 'jammy'." >&2
    exit 1
   ;;
  esac
}

function get_distro() {
  require_distro
  # shellcheck source=/dev/null disable=SC2005
  echo "$(. /etc/os-release && echo "${VERSION_CODENAME}")"
}

function require_root () {
  if [[ $(is_root) -ne 0 ]]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
}

function require_user () {
  if [[ -z "${USER_NAME}" ]]; then
    echo "No USER_NAME defined - skipping: ${USER_NAME}" >&2
    exit 1;
  fi
}

function require_tool () {
  local tool=$1

  if [[ -z "${tool}" ]]; then
    echo "No tool defined - skipping: ${tool}" >&2
    exit 1;
  fi

  local tool_env
  local version

  tool_env=$(get_tool_version_env "$tool")
  version=${2-${!tool_env}}

  if [[ -z ${version} ]]; then
    echo "No version defined - aborting: ${version}" >&2
    exit 1
  fi

  local VERSION_PREFIX="^v?(.+)"
  if [[ "${version}" =~ ${VERSION_PREFIX} ]]; then
    # trim leading v
    version=${BASH_REMATCH[1]}
  fi

  export "TOOL_NAME=${tool}" "TOOL_VERSION=${version}"

  # compability fallback
  export "${tool_env}=${version}"
}

ignore_tool() {
    local tools=${IGNORED_TOOLS,,}
    [[ $tools =~ (^|,)$TOOL_NAME($|,) ]] && echo 1 || echo 0
}

# Checks if the current caller is root or not
function is_root () {
  if [[ $EUID -ne 0 ]]; then
    echo 1
  else
    echo 0
  fi
}

# Will check if the variable given with the name is set else will exit
# when the second parameter is set it will make an empty check
function check () {

  if [ "${!1+SET}" != "SET" ] ; then
    echo "param ${1} is not set"
    exit 1
  fi
  if [ -n "${2}" ] && [ -z "${!1}" ]; then
    echo "param ${1} is set but empty"
    exit 1
  fi
}
