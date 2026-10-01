#!/bin/bash

# v2 shell tool like custom images ship them, sourced by `v2-install-tool.sh`
# installs a small script which prints its name and version

function prepare_tool() {
  touch "$(find_tool_path)/prepared"
}

function init_tool () {
  touch "$(find_tool_path)/initialized"
}

function install_tool () {
  local versioned_tool_path

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  printf '#!/bin/bash\necho "%s %s"\n' "${TOOL_NAME}" "${TOOL_VERSION}" > "${versioned_tool_path}/bin/${TOOL_NAME}"
  chmod +x "${versioned_tool_path}/bin/${TOOL_NAME}"
}

function link_tool () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
}

function test_tool () {
  dummy-v2 --version
}
