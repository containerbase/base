#!/bin/bash

export ENV_FILE=/usr/local/etc/env

check_debug() {
  local bool="${BUILDPACK_DEBUG:-false}"
  # comparison is performed without regard to the case of alphabetic characters
  shopt -s nocasematch
  if [[ "$bool" = 1 || "$bool" =~ ^(yes|true)$ ]]; then
    set -x
  fi
}
check_debug

function refreshenv () {
  if [[ -r "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    . $ENV_FILE
  fi
}

if [[ -z "${BUILDPACK+x}" ]]; then
  refreshenv
fi

function export_env () {
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> $ENV_FILE
}

function export_path () {
  export PATH="$1:$PATH"
  echo export PATH="$1:\$PATH" >> $ENV_FILE
}

function reset_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  if [[ -f "$install_dir/env.d/${TOOL_NAME}.sh" ]];then
    rm "$install_dir/env.d/${TOOL_NAME}.sh"
  fi
}

function find_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  echo "$install_dir/env.d/${TOOL_NAME}.sh"
}

function export_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> "$install_dir"/env.d/"${TOOL_NAME}".sh
}

function export_tool_path () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export PATH="$1:$PATH"
  echo export PATH="$1:\$PATH" >> "$install_dir"/env.d/"${TOOL_NAME}".sh
}


# use this if custom env is required, creates a shell wrapper to /usr/local/bin or /home/<user>/bin
function shell_wrapper () {
  local install_dir
  local FILE="${install_dir}/bin/${1}"
  install_dir=$(get_install_dir)
  check_command "$1"
  cat > "$FILE" <<- EOM
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
  chmod +x "$FILE"
}

# use this for simple symlink to /usr/local/bin or /home/<user>/bin
function link_wrapper () {
  local install_dir
  local TARGET
  local SOURCE=$2
  install_dir=$(get_install_dir)
  TARGET="${install_dir}/bin/${1}"
  if [[ -z "$SOURCE" ]]; then
    SOURCE=$(command -v "${1}")
  fi
  if [[ -d "$SOURCE" ]]; then
    SOURCE=$SOURCE/${1}
  fi
  check_command "$SOURCE"
  ln -sf "$SOURCE" "$TARGET"
}


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
  if [[ "${APT_HTTP_PROXY}" ]]; then
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
  local VERSION_CODENAME
  # shellcheck source=/dev/null
  VERSION_CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  case "$VERSION_CODENAME" in
  "bionic") ;; #supported
  "focal") ;; #supported
  *)
    echo "Distro not supported: ${VERSION_CODENAME}! Please use 'ubuntu bionic or focal'." >&2
    exit 1
   ;;
  esac
}

function get_distro() {
  require_distro
  # shellcheck source=/dev/null disable=2005
  echo "$(. /etc/os-release && echo "${VERSION_CODENAME}")"
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
  tool=${tool^^}_VERSION
  echo "${tool}"
}

function require_tool () {
  local tool=$1

  if [[ -z "${1+x}" ]]; then
    echo "No tool defined - skipping: ${tool}" >&2
    exit 1;
  fi

  local tool_env
  local version

  tool_env=$(get_tool_version_env "$tool")
  version=${2-${!tool_env}}

  if [[ -z ${version+x} ]]; then
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


function get_install_dir () {
  if [[ $EUID -eq 0 ]]; then
    echo /usr/local
  else
    # shellcheck disable=SC2153
    echo "${USER_HOME}"
  fi
}

function find_tool_path () {
  install_dir=$(get_install_dir)
  if [[ -d "${install_dir}/${TOOL_NAME}" ]]; then
    echo "${install_dir}/${TOOL_NAME}"
  fi
}

function find_versioned_tool_path () {
  tool_dir=$(find_tool_path)
  if [[ -d "${tool_dir}/${TOOL_VERSION}" ]]; then
    echo "${tool_dir}/${TOOL_VERSION}"
  fi
}

function create_versioned_tool_path () {
  install_dir=$(get_install_dir)
  mkdir -p "${install_dir}/${TOOL_NAME}/${TOOL_VERSION}"
  echo "${install_dir}/${TOOL_NAME}/${TOOL_VERSION}"
}


ignore_tool() {
    local tools=${IGNORED_TOOLS,,}
    [[ $tools =~ (^|,)$TOOL_NAME($|,) ]] && echo 1 || echo 0
}
