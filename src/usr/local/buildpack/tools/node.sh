#!/bin/bash

set -ex

require_root
check_semver $TOOL_VERSION

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

if [[ -d "${NODE_INSTALL_DIR}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

NODE_DISTRO=linux-x64
NODE_INSTALL_DIR=/usr/local/node/${TOOL_VERSION}

function update_env () {
  PATH="${1}/bin:${PATH}"
  link_wrapper ${TOOL_NAME}
  link_wrapper npm
  link_wrapper npx
}

function prepare_prefix () {
  local prefix=${1}
  # npm 7 bug
  mkdir -p ${prefix}/{bin,lib}
}

function prepare_global_config () {
  local prefix=${1}
  prepare_prefix ${prefix}
  npm config set prefix ${prefix} --global
}

function prepare_user_config () {
  local prefix=${1}
  prepare_prefix ${prefix}
  export_path "${prefix}/bin"
  chown -R ${USER_ID} ${prefix}
  chmod -R g+w ${prefix}

  su $USER_NAME -c "npm config set prefix ${prefix}"
  cat >> $ENV_FILE <<- EOM
# openshift override unknown user home
if [ "\${EUID}" != 0 ] && [ "\${EUID}" != ${USER_ID} ]; then
  export NPM_CONFIG_PREFIX="${prefix}"
fi
EOM
}

mkdir -p $NODE_INSTALL_DIR

curl -sLo node.tar.xz https://nodejs.org/dist/v${TOOL_VERSION}/node-v${TOOL_VERSION}-${NODE_DISTRO}.tar.xz
tar -C ${NODE_INSTALL_DIR} --strip 1 -xf node.tar.xz
rm node.tar.xz

update_env ${NODE_INSTALL_DIR}

if [[ ${MAJOR} < 15 ]]; then
  # update to latest node-gyp to fully support python3
  ${NODE_INSTALL_DIR}/bin/npm explore npm -g -- npm install --cache /tmp/empty-cache node-gyp@latest
  rm -rf /tmp/empty-cache
fi


# redirect root install
prepare_global_config /usr/local

# redirect user install
prepare_user_config "${USER_HOME}/.npm-global"

echo node: $(node --version) $(command -v node)
echo npm: $(npm --version)  $(command -v npm)

# Clean download cache
npm cache clean --force

# Clean node-gyp cache
rm -rf /root/.cache
