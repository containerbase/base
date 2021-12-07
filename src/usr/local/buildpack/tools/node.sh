#!/bin/bash

set -e

require_root
check_semver $TOOL_VERSION

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi


NODE_DISTRO=linux-x64
NODE_INSTALL_DIR=/usr/local/node/${TOOL_VERSION}

if [[ -d "${NODE_INSTALL_DIR}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi


mkdir -p $NODE_INSTALL_DIR

curl -sLo node.tar.xz https://nodejs.org/dist/v${TOOL_VERSION}/node-v${TOOL_VERSION}-${NODE_DISTRO}.tar.xz
tar -C ${NODE_INSTALL_DIR} --strip 1 -xf node.tar.xz
rm node.tar.xz

PATH="${NODE_INSTALL_DIR}/bin:${PATH}"

if [[ ${MAJOR} < 15 ]]; then
  # update to latest node-gyp to fully support python3
  npm explore npm -g -- npm install --cache /tmp/empty-cache node-gyp@latest

  rm -rf /tmp/empty-cache
fi

echo node: $(node --version) $(command -v node)
echo npm: $(npm --version)  $(command -v npm)

# redirect root install
npm config set prefix /usr/local --global

NPM_CONFIG_PREFIX="${USER_HOME}/.npm-global"

# npm 7 bug
mkdir -p $NPM_CONFIG_PREFIX/{bin,lib}
chown -R ${USER_ID} $NPM_CONFIG_PREFIX
chmod -R g+w $NPM_CONFIG_PREFIX

# redirect user install
su $USER_NAME -c 'npm config set prefix $NPM_CONFIG_PREFIX'
cat >> $ENV_FILE <<- EOM
# openshift override unknown user home
if [ "\${EUID}" != 0 ] && [ "\${EUID}" != ${USER_ID} ]; then
  export NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX"
fi
EOM

# export_env NPM_CONFIG_PREFIX $NPM_CONFIG_PREFIX
export_path "\$NPM_CONFIG_PREFIX/bin"

link_wrapper node
link_wrapper npm
link_wrapper npx

# Clean download cache
npm cache clean --force

# Clean node-gyp cache
rm -rf /root/.cache
