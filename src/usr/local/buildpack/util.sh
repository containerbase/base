#!/bin/bash

# get path location
DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

# TEST_ROOT_DIR is only set during testing, otherwise it is empty
export ENV_FILE="${TEST_ROOT_DIR}/usr/local/etc/env"
export BASH_RC_FILE="${TEST_ROOT_DIR}/etc/bash.bashrc"

# include helper files
# shellcheck source=/dev/null
. "${DIR}/utils/folders.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/env.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/versions.sh"
# shellcheck source=/dev/null
. "${DIR}/utils/link.sh"

# Will check if the debug flag is set to enable verbose logging
function check_debug() {
  local bool="${BUILDPACK_DEBUG:-false}"
  # comparison is performed without regard to the case of alphabetic characters
  shopt -s nocasematch
  if [[ "$bool" = 1 || "$bool" =~ ^(yes|true)$ ]]; then
    set -x
  fi
}
check_debug

# Reloads the global environment and from all tools
function refreshenv () {
  if [[ -r "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    . "$ENV_FILE"
  fi
}

if [[ -z "${BUILDPACK+x}" ]]; then
  refreshenv
fi

# Checks if the caller is root, will take TEST_ROOT_USER into account if set
function is_root () {
  if [[ ${EUID} -ne 0 && ( -z ${TEST_ROOT_USER} || ( -n ${TEST_ROOT_USER} && ${TEST_ROOT_USER} -ne 0 ) ) ]]; then
    echo 1
    exit
  fi
  echo 0
}

# Will check if the variable given with the name is set else will exit
function check () {
  if [ "${!1+SET}" != "SET" ] ; then
    echo "param ${1} is not set"
    exit 1
  fi
}

# Will check if the given tool is a executable command
function check_command () {
  local tool_path=$1
  check tool_path

  if [[ ! -x $(command -v "${tool_path}") ]]; then
    echo "No ${1} defined - aborting" >&2
    exit 1
  fi
}

SEMVER_REGEX="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\+[0-9]+)?([a-z-].*)?$"

# Will check if the given string is a valid semversion and splits it into major, minor and patch versions
function check_semver () {
  local semver=${1}
  check semver

  if [[ ! "${semver}" =~ ${SEMVER_REGEX} ]]; then
    echo Not a semver like version - aborting: "${semver}"
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}
}


# Will install the given packages with apt
function apt_install () {
  echo "Installing apt packages: $*"
  if [[ -n "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get -qq install -y "$@"

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}

# Will upgrade the system with apt
function apt_upgrade () {
  echo "Upgrading apt packages"
  if [[ "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get upgrade -y

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}

# Will check that the current distro is supported
function require_distro () {
  local codename
  # shellcheck source=/dev/null
  codename=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  case "$codename" in
  "bionic") ;; #supported
  "focal") ;; #supported
  *)
    echo "Distro not supported: ${codename}! Please use 'ubuntu bionic or focal'." >&2
    exit 1
   ;;
  esac
}

# Will get the code name of the current distro
function get_distro() {
  local codename
  # shellcheck source=/dev/null
  codename=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  echo "$codename"
}

# Will check if the current user is root and aborts otherwise
function require_root () {
  if [ "$(is_root)" -ne 0 ]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
}

# Will check if USER_NAME is set and aborts otherwise
function require_user () {
  if [[ -z "${USER_NAME}" ]]; then
    echo "No USER_NAME defined - skipping: ${USER_NAME}" >&2
    exit 1;
  fi
}

# Will fetch the tool name and version and stores them in TOOL_NAME and TOOL_VERSION
function require_tool () {
  local tool=${1}
  check tool

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

# Will check if the current tool is ignored
ignore_tool() {
    local tools=${IGNORED_TOOLS,,}
    [[ $tools =~ (^|,)$TOOL_NAME($|,) ]] && echo 1 || echo 0
}
