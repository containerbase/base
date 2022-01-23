#!/bin/bash

function gem_install() {
  tool_path=$(find_tool_path)

  if [[ -z "${tool_path}" ]]; then
    tool_path=$(create_versioned_tool_path)
    mkdir -p "${tool_path}"

    GEM_HOME=$tool_path gem install  --bindir "$tool_path"/bin "${TOOL_NAME}" -v "${TOOL_VERSION}"

  # TODO: clear gem cache
  fi
}


function gem_link_wrapper() {
  link_wrapper ${1:-$TOOL_NAME} $tool_path/bin
}

function gem_shell_wrapper () {
  local install_dir
  local tool_file
  local ruby_version

  install_dir=$(get_install_dir)
  tool_file=${install_dir}/bin/${1:-$TOOL_NAME}
  # TODO: make generic
  ruby_version=$(cat /usr/local/ruby/.version)

  tool_path=$(find_versioned_tool_path)
  check_command ${tool_path}/bin/${1:-$TOOL_NAME}
  cat > $tool_file <<- EOM
#!/bin/bash

export GEM_PATH=${tool_path}:/usr/local/ruby/${ruby_version}/lib/ruby/gems/${ruby_version} PATH=${tool_path}/bin:\$PATH

${1:-$TOOL_NAME} "\$@"
EOM
  chmod +x $tool_file
}
