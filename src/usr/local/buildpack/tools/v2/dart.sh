#!/bin/bash

function prepare_tool() {
  mkdir ~/.dart "${USER_HOME}/.dart"
  echo '{ "firstRun": false, "enabled": false }' > ~/.dart/dartdev.json
  echo '{ "firstRun": false, "enabled": false }' > "${USER_HOME}/.dart/dartdev.json"
  chown -R "${USER_NAME}" "${USER_HOME}/.dart"
  chmod -R g=u "${USER_HOME}/.dart/"
}

# https://storage.googleapis.com/dart-archive/channels/stable/release/1.11.0/sdk/dartsdk-linux-x64-release.zip
# https://storage.googleapis.com/dart-archive/channels/stable/release/2.18.0/sdk/dartsdk-linux-x64-release.zip
function install_tool () {
  local versioned_tool_path
  local DART_SDK_CHANNEL="stable"
  local DART_SDK_URL="https://storage.googleapis.com/dart-archive/channels/${DART_SDK_CHANNEL}/release/${TOOL_VERSION}/sdk/dartsdk-linux-x64-release.zip"
  local file

  # if [[ $MAJOR -lt 1 || ($MAJOR -eq 1 && $MINOR -lt 11) ]]; then
  #   echo "dart < 1.11.0 is not supported: ${MAJOR}.${MINOR}" >&2
  #   exit 1
  # fi

  if [ "$MAJOR" -lt 2 ]; then
    echo "dart < 2.0.0 is not supported: ${MAJOR}.${MINOR}" >&2
    exit 1
  fi

  versioned_tool_path=$(create_versioned_tool_path)
  file=$(get_from_url "$DART_SDK_URL")
  bsdtar -C "${versioned_tool_path}" --strip 1 -xf "${file}"

  # we need write access to some sub dirs for non root :-(
  # if [[ $(is_root) -eq 0 ]]; then
  #   chgrp -R root "${versioned_tool_path}"
  #   chmod -R g+w "${versioned_tool_path}"
  # fi

  # git unsafe directory
  # if [[ $(is_root) -eq 0 ]]; then
  #   git config --system --add safe.directory "${versioned_tool_path}"
  # else
  #   git config --global --add safe.directory "${versioned_tool_path}"
  # fi
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  export_tool_env DART_ROOT "${versioned_tool_path}"
  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"

  dart --version

  if [[ $(is_root) -eq 0 ]]; then
    # chmod -R g+w "${versioned_tool_path}"
    su -c 'dart --version' "${USER_NAME}"
  fi
}
