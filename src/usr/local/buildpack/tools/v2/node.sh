#!/bin/bash

# shellcheck source=/dev/null
. "$(get_buildpack_path)/utils/node.sh"

# Helper function to link to a globally installed node
function prepare_global_config () {
  local prefix=${1}
  prepare_prefix "${prefix}"
  mkdir -p "${versioned_tool_path}/etc"
  echo "prefix = \"${prefix}\"" >> "${versioned_tool_path}/etc/npmrc"
}

# Helper function to link to a user installed node
function prepare_user_config () {
  local prefix=${1}
  if grep -s -q 'prefix' "${USER_HOME}/.npmrc" > /dev/null
  then
    return
  fi

  prepare_prefix "${prefix}"
  echo "prefix = \"${prefix}\"" >> "${USER_HOME}/.npmrc"
  mkdir -p "${USER_HOME}/.npm/_logs"
  chown -R "${USER_ID}" "${prefix}" "${USER_HOME}/.npmrc" "${USER_HOME}/.npm"
  chmod -R g+w "${prefix}" "${USER_HOME}/.npmrc" "${USER_HOME}/.npm"
}

function prepare_prefix () {
  local prefix=${1}
  # npm 7 bug
  mkdir -p "${prefix}"/{bin,lib}
}

function check_tool_requirements () {
  check_semver "$TOOL_VERSION" "minor"
}

function install_tool () {
  local versioned_tool_path
  local npm # temp npm executable
  local arch=linux-x64

  versioned_tool_path=$(create_versioned_tool_path)

  # init temp dir
  npm_init

  npm=${versioned_tool_path}/bin/npm

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  # download file
  file=$(get_from_url "https://nodejs.org/dist/v${TOOL_VERSION}/node-v${TOOL_VERSION}-${arch}.tar.xz")
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

  if [[ ${MAJOR} -lt 15 ]]; then
    echo "updating node-gyp"
    # update to latest node-gyp to fully support python3
    $npm explore npm -g --prefix "$versioned_tool_path" --silent -- "$npm" install node-gyp@latest --no-audit --cache "${NPM_CONFIG_CACHE}" --silent 2>&1
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
  if [[ ! -f "$(get_bin_path)/npm" ]]; then
    link_wrapper npm "${versioned_tool_path}/bin"
    link_wrapper npx "${versioned_tool_path}/bin"
  fi

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
