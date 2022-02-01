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



function find_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  echo "$install_dir/env.d/${TOOL_NAME}.sh"
}

# use this if custom env is required, creates a shell wrapper to ${install_dir}/bin
function shell_wrapper () {
  local install_dir
  install_dir=$(get_install_dir)
  local tool_file
  tool_file="${install_dir}/bin/${1}"

  check_command "$1"
  cat > "$tool_file" <<- EOM
#!/bin/bash

if [[ -r "$ENV_FILE" && -z "${BUILDPACK+x}" ]]; then
  . $ENV_FILE
fi

if [[ "\$(command -v ${1})" == "$FILE" ]]; then
  echo Could not forward ${1}, probably wrong PATH variable. >&2
  echo PATH=\$PATH
  exit 1
fi

${1} "\$@"
EOM
  chmod +x "$tool_file"
}

# use this for simple symlink to ${install_dir}/bin
function link_wrapper () {
  local install_dir
  local tool=$1
  local source=$2

  install_dir=$(get_install_dir)
  local target="${install_dir}/bin/${tool}"

  if [[ -z "$source" ]]; then
    source=$(command -v "${tool}")
  fi
  if [[ -d "$source" ]]; then
    source=$source/${tool}
  fi

  check_command "$source"
  ln -sf "$source" "$target"
}


function check_command () {
  local tool_path=$1
  if [[ ! -x $(command -v "${tool_path}") ]]; then
    echo "No ${1} defined - aborting" >&2
    exit 1
  fi
}

SEMVER_REGEX="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\+[0-9]+)?([a-z-].*)?$"

function check_semver () {
  if [[ ! "${1}" =~ ${SEMVER_REGEX} ]]; then
    echo Not a semver like version - aborting: "${1}"
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}
}


function apt_install () {
  echo "Installing apt packages: $*"
  if [[ -n "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get -qq install -y "$@"

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}

function apt_upgrade () {
  echo "Upgrading apt packages"
  if [[ "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get upgrade -y

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}

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

function get_distro() {
  local codename
  # shellcheck source=/dev/null
  codename=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  echo "$codename"
}

function require_root () {
  if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
}

function require_user () {
  if [[ -z "${USER_NAME+x}" ]]; then
    echo "No USER_NAME defined - skipping: ${USER_NAME}" >&2
    exit 1;
  fi
}

function get_tool_version_env () {
  local tool=${1//-/_}

  if [[ -z "${tool}" ]]; then
    echo "No tool defined - skipping: ${tool}" >&2
    exit 1;
  fi

  tool=${tool^^}_VERSION
  echo "${tool}"
}

function require_tool () {
  local tool=${1}

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

  export "TOOL_NAME=${1}" "TOOL_VERSION=${version}"

  # compability fallback
  export "${tool_env}=${version}"
}

ignore_tool() {
    local tools=${IGNORED_TOOLS,,}
    [[ $tools =~ (^|,)$TOOL_NAME($|,) ]] && echo 1 || echo 0
}
