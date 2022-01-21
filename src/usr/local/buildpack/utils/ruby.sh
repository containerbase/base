#!/bin/bash

function gem_install() {
  tool_path=$(find_tool_path)

  if [[ -z "${tool_path}" ]]; then
    INSTALL_DIR=$(get_install_dir)
    base_path=${INSTALL_DIR}/${TOOL_NAME}
    tool_path=${base_path}/${TOOL_VERSION}

    mkdir -p ${tool_path}

    GEM_HOME=$tool_path gem install  --bindir $tool_path/bin ${TOOL_NAME} -v ${TOOL_VERSION}

  # TODO: clear gem cache
  fi
}


function gem_link_wrapper() {
  link_wrapper ${1:-$TOOL_NAME} $tool_path/bin
}

function gem_shell_wrapper () {
  local install_dir=$(get_install_dir)
  local FILE="${install_dir}/bin/${1:-$TOOL_NAME}"
  # TODO: make generic
  local ruby_version=$(cat /usr/local/ruby/.version)
  tool_path=$(find_tool_path)
  check_command ${tool_path}/bin/${1:-$TOOL_NAME}
  cat > $FILE <<- EOM
#!/bin/bash

export GEM_PATH=${tool_path}:/usr/local/ruby/${ruby_version}/lib/ruby/gems/${ruby_version} PATH=${tool_path}/bin:\$PATH

${1:-$TOOL_NAME} "\$@"
EOM
  chmod +x $FILE
}
