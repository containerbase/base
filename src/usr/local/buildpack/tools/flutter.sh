#!/bin/bash

set -e

require_root


tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_env FLUTTER_ROOT ${1}
  export_tool_path "${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}

  FLUTTER_SDK_CHANNEL="stable"
  FLUTTER_SDK_URL="https://storage.googleapis.com/flutter_infra/releases/${FLUTTER_SDK_CHANNEL}/linux/flutter_linux_v${TOOL_VERSION}-${FLUTTER_SDK_CHANNEL}.tar.xz"
  FLUTTER_SDK_ARCHIVE=flutter.tar.xz

  curl -sSL $FLUTTER_SDK_URL -o $FLUTTER_SDK_ARCHIVE
  tar -C $tool_path --strip 1 -xf $FLUTTER_SDK_ARCHIVE
  rm $FLUTTER_SDK_ARCHIVE


  # we need write access to flutter :-(
  chgrp -R root $tool_path
  chmod -R g=u $tool_path


  if [[ ! -f "/home/${USER_NAME}/.flutter" ]]; then
    echo '{ "firstRun": false, "enabled": false }' > ~/.flutter
    echo '{ "firstRun": false, "enabled": false }' > /home/${USER_NAME}/.flutter
    chown ${USER_NAME} /home/${USER_NAME}/.flutter
    chmod -R g=u /home/${USER_NAME}/.flutter
  fi

  update_env ${tool_path}
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi


flutter --version

if [[ $EUID -eq 0 ]]; then
  su -c 'flutter --version' ${USER_NAME}
fi

shell_wrapper python
