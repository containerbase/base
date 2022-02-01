#!/bin/bash

function legacy_tool_install () {

  set -e

  check_semver "$TOOL_VERSION"

  if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
    echo Invalid version: "${TOOL_VERSION}"
    exit 1
  fi

  NODE_DISTRO=linux-x64
  tool_path=$(find_versioned_tool_path)
  INSTALL_DIR=$(get_install_dir)
  PREFIX="${USER_HOME}/.npm-global"


  function update_env () {
    local tool_env

    reset_tool_env

    link_wrapper "${TOOL_NAME}" "$tool_path/bin"
    link_wrapper npm "$tool_path/bin"
    link_wrapper npx "$tool_path/bin"

    export_tool_path "${PREFIX}/bin"

    tool_env=$(find_tool_env)

    cat >> "$tool_env" <<- EOM
# openshift override unknown user home
if [ "\${EUID}" != 0 ] && [ "\${EUID}" != ${USER_ID} ]; then
  export NPM_CONFIG_PREFIX="${PREFIX}"
fi
EOM
  }

  function prepare_prefix () {
    local prefix=${1}
    # npm 7 bug
    mkdir -p "${prefix}"/{bin,lib}
  }

  function prepare_global_config () {
    local prefix=${1}
    prepare_prefix "${prefix}"
    mkdir -p "${tool_path}/etc"
    echo "prefix = \"${prefix}\"" >> "${tool_path}/etc/npmrc"
  }

  function prepare_user_config () {
    local prefix=${1}
    if grep 'prefix' "${USER_HOME}/.npmrc"; then
      return
    fi

    prepare_prefix "${prefix}"
    echo "prefix = \"${prefix}\"" >> "${USER_HOME}/.npmrc"
    chown -R "${USER_ID}" "${prefix}" "${USER_HOME}/.npmrc"
    chmod -R g+w "${prefix}" "${USER_HOME}/.npmrc"
  }

  if [[ -z "${tool_path}" ]]; then
    base_path=${INSTALL_DIR}/${TOOL_NAME}
    tool_path=${base_path}/${TOOL_VERSION}
    npm=${tool_path}/bin/npm

    mkdir -p "$tool_path"

    file=/tmp/${TOOL_NAME}.tar.xz

    curl -sLo "${file}" "https://nodejs.org/dist/v${TOOL_VERSION}/node-v${TOOL_VERSION}-${NODE_DISTRO}.tar.xz"
    tar -C "${tool_path}" --strip 1 -xf "${file}"
    rm "${file}"

    if [[ $EUID -eq 0 ]]; then
      # redirect root install
      prepare_global_config /usr/local

      # redirect user install
      prepare_user_config "${PREFIX}"
    else
      # redirect user install
      prepare_global_config "${PREFIX}"
    fi

    # required for npm
    link_wrapper "${TOOL_NAME}" "$tool_path/bin"

    if [[ ${MAJOR} -lt 15 ]]; then
      # update to latest node-gyp to fully support python3
      NPM_CONFIG_PREFIX=$tool_path $npm explore npm -g -- "$npm" install --cache /tmp/empty-cache node-gyp@latest
      rm -rf /tmp/empty-cache
    fi

    # Clean download cache
    NPM_CONFIG_PREFIX=$tool_path $npm cache clean --force

    # Clean node-gyp cache
    rm -rf "$HOME/.cache"
  fi

  update_env "${tool_path}"

  echo "node: $(node --version) $(command -v node)"
  echo "npm: $(npm --version)  $(command -v npm)"
}

