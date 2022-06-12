#!/bin/bash

# get path location
DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

# shellcheck source=/dev/null
. "$DIR/../../utils/node.sh"

function check_tool_requirements () {
  check_semver "$TOOL_VERSION"

  if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
    echo Invalid version: "${TOOL_VERSION}"
    exit 1
  fi
}

function install_tool () {
  local versioned_tool_path
  local npm # temp npm executable

  versioned_tool_path=$(create_versioned_tool_path)

  # init temp dir
  npm_init

  npm=${versioned_tool_path}/bin/npm

  # download file
  file=$(get_from_url "https://nodejs.org/dist/v${TOOL_VERSION}/node-v${TOOL_VERSION}-linux-x64.tar.xz")
  # extract
  tar -C "${versioned_tool_path}" --strip 1 -xf "${file}"

  if [[ $(is_root) -eq 0 ]]; then
    # redirect root install
    prepare_global_config /usr/local

    # redirect user install
    prepare_user_config "${USER_HOME}/.npm-global"
  else
    # redirect user install
    prepare_global_config "${USER_HOME}/.npm-global"
  fi

  # required for npm
  link_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"

  # get semver
  check_semver "$TOOL_VERSION"

  if [[ ${MAJOR} -lt 15 ]]; then
    echo "updating node-gyp"
    # update to latest node-gyp to fully support python3
    $npm explore npm --global --prefix "$versioned_tool_path" -- "$npm" install node-gyp@latest --no-audit --cache "${NPM_CONFIG_CACHE}" 2>&1
  fi

  # clean temp dir
  npm_clean
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  local tool_env

  reset_tool_env

  link_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  link_wrapper npm "${versioned_tool_path}/bin"
  link_wrapper npx "${versioned_tool_path}/bin"

  export_tool_path "${USER_HOME}/.npm-global/bin"
  export_tool_env NO_UPDATE_NOTIFIER 1
  export_tool_env NPM_CONFIG_UPDATE_NOTIFIER false
  export_tool_env NPM_CONFIG_FUND false

  tool_env=$(find_tool_env)

  # if not root, set the npmprefix config option to the user folder
  cat >> "$tool_env" <<- EOM
# openshift override unknown user home
if [ "\${EUID}" != 0 ] && [ "\${EUID}" != ${USER_ID} ]; then
  export NPM_CONFIG_PREFIX="${USER_HOME}/.npm-global"
fi
EOM

  echo "node: $(node --version) $(command -v node)"
  echo "npm: $(npm --version)  $(command -v npm)"
}
