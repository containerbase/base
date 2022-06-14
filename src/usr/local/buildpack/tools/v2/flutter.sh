#!/bin/bash
function prepare_tool() {
  echo '{ "firstRun": false, "enabled": false }' > ~/.flutter
  echo '{ "firstRun": false, "enabled": false }' > "${USER_HOME}/.flutter"
  chown "${USER_NAME}" "${USER_HOME}/.flutter"
  chmod -R g=u "${USER_HOME}/.flutter"
}

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  local FLUTTER_SDK_CHANNEL="stable"
  local FLUTTER_SDK_URL="https://storage.googleapis.com/flutter_infra_release/releases/${FLUTTER_SDK_CHANNEL}/linux/flutter_linux_${TOOL_VERSION}-${FLUTTER_SDK_CHANNEL}.tar.xz"
  local file

  if [[ $MAJOR -lt 1 || ($MAJOR -eq 1 && $MINOR -lt 17) ]]; then
    echo "flutter < 1.17.0 is not supported: ${MAJOR}.${MINOR}" >&2
    exit 1
  fi

  file=$(get_from_url "$FLUTTER_SDK_URL")
  tar -C "${versioned_tool_path}" --strip 1 -xf "${file}"

  # we need write access to some sub dirs for non root :-(
  if [[ $(is_root) -eq 0 ]]; then
    chgrp -R root "${versioned_tool_path}"
    chmod -R g+w "${versioned_tool_path}"
  fi

  # git unsafe directory
  if [[ $(is_root) -eq 0 ]]; then
    git config --system --add safe.directory "${versioned_tool_path}"
  else
    git config --global --add safe.directory "${versioned_tool_path}"
  fi
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  export_tool_env FLUTTER_ROOT "${versioned_tool_path}"
  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"

  flutter --version

  if [[ $(is_root) -eq 0 ]]; then
    chmod -R g+w "${versioned_tool_path}"
    su -c 'flutter --version' "${USER_NAME}"
  fi
}
