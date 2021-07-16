#!/bin/bash

function refreshenv () {
  if [[ -r $BASH_ENV ]]; then
    . $BASH_ENV
  fi
}

if [[ -z "${BUILDPACK+x}" ]]; then
  refreshenv
fi

function export_env () {
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> $BASH_ENV
}

function export_path () {
  export PATH="$1:$PATH"
  echo export PATH="$1:\$PATH" >> $BASH_ENV
}

function reset_tool_env () {
  local install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  if [[ -f "$install_dir/env.d/${TOOL_NAME}.sh" ]];then
    rm "$install_dir/env.d/${TOOL_NAME}.sh"
  fi
}


function export_tool_env () {
  local install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> $install_dir/env.d/${TOOL_NAME}.sh
}

function export_tool_path () {
  local install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export PATH="$1:$PATH"
  echo export PATH="$1:\$PATH" >> $install_dir/env.d/${TOOL_NAME}.sh
}


# use this if custom env is required, creates a shell wrapper to /usr/local/bin
function shell_wrapper () {
  local install_dir=$(get_install_dir)
  local FILE="${install_dir}/bin/${1}"
  check_command $1
  cat > $FILE <<- EOM
#!/bin/bash

if [[ -f "\$BASH_ENV" && -z "${BUILDPACK+x}" ]]; then
  . \$BASH_ENV
fi

if [[ "\$(command -v ${1})" == "$FILE" ]]; then
  echo Could not forward ${1}, probably wrong PATH variable. >&2
  echo PATH=\$PATH
  exit 1
fi

${1} "\$@"
EOM
  chmod +x $FILE
}

# use this for simple symlink to /usr/local/bin
function link_wrapper () {
  local install_dir=$(get_install_dir)
  local TARGET="${install_dir}/bin/${1}"
  local SOURCE=$(command -v ${1})
  check_command $1
  ln -sf $SOURCE $TARGET
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
  if [[ ! -x "$(command -v ${1})" ]]; then
    echo "No ${1} defined - aborting" >&2
    exit 1
  fi
}


SEMVER_REGEX="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?([a-z-].*)?$"

function check_semver () {
  if [[ ! "${1}" =~ ${SEMVER_REGEX} ]]; then
    echo Not a semver like version - aborting: ${1}
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}
}


function apt_install () {
  echo "Installing apt packages: ${@}"
  if [[ "${APT_HTTP_PROXY}" ]]; then
    echo "Acquire::HTTP::Proxy \"${APT_HTTP_PROXY}\";" | tee -a /etc/apt/apt.conf.d/buildpack-proxy
  fi
  apt-get -qq update
  apt-get -qq install -y "$@"

  rm -f /etc/apt/apt.conf.d/buildpack-proxy
}

function require_distro () {
  local VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})
  case "$VERSION_CODENAME" in
  "bionic") ;; #supported
  "focal") ;; #supported
  *)
    echo "Distro not supported: ${VERSION_CODENAME}! Please use 'ubuntu bionic or focal'." >&2
    exit 1
   ;;
  esac
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
  echo ${tool}
}

function require_tool () {
  local tool=$1

  if [[ -z "${1+x}" ]]; then
    echo "No tool defined - skipping: ${tool}" >&2
    exit 1;
  fi

  local tool_env=$(get_tool_version_env $tool)
  local version=${2-${!tool_env}}

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
    echo ${USER_HOME}
  fi
}

function find_tool_path () {
  if [[ -d "/usr/local/${TOOL_NAME}/${TOOL_VERSION}" ]]; then
    echo /usr/local/${TOOL_NAME}/${TOOL_VERSION}
  elif [[ -d "${USER_HOME}/${TOOL_NAME}/${TOOL_VERSION}" ]]; then
    echo ${USER_HOME}/${TOOL_NAME}/${TOOL_VERSION}
  fi
}

ignore_tool() {
    local tools=${IGNORED_TOOLS,,}
    [[ $tools =~ (^|,)$TOOL_NAME($|,) ]] && echo 1 || echo 0
}
