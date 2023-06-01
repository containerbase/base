#!/bin/bash

function prepare_tool() {
  echo '{ "firstRun": false, "enabled": false }' > ~/.flutter
  echo '{ "firstRun": false, "enabled": false }' > "${USER_HOME}/.flutter"
  chown "${USER_NAME}" "${USER_HOME}/.flutter"
  chmod g=u "${USER_HOME}/.flutter"
}

function install_tool () {
  local versioned_tool_path

  versioned_tool_path=$(create_versioned_tool_path)

  git clone \
    --quiet \
    -c advice.detachedHead=false \
    --depth 1 \
    --filter=blob:none \
    --branch "${TOOL_VERSION}" \
    https://github.com/flutter/flutter.git \
    "${versioned_tool_path}"

  # download dart sdk and init flutter (too heavy)
  #"${versioned_tool_path}/bin/flutter" precache

  # git unsafe directory
  if [[ $(is_root) -eq 0 ]]; then
    git config --system --add safe.directory "${versioned_tool_path}"
  else
    git config --global --add safe.directory "${versioned_tool_path}"
  fi

  # download dart sdk and init flutter
  "${versioned_tool_path}/bin/flutter" --version
  # fix rights
  chmod -R g+w "${versioned_tool_path}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  [[ -n $SKIP_VERSION ]] || flutter --version
}
