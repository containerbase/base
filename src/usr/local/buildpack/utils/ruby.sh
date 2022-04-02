#!/bin/bash

function gem_install() {
  local tool_path
  local tool_name

  # shellcheck disable=SC2153
  tool_name="${TOOL_NAME}"
  tool_path=$(find_tool_path)

  if [[ -z "${tool_path}" ]]; then
    tool_path=$(create_versioned_tool_path)
    mkdir -p "${tool_path}"

    GEM_HOME=$tool_path gem install --bindir "$tool_path/bin" "${tool_name}" -v "${TOOL_VERSION}"

    # TODO: clear gem cache
  fi
}


function gem_link_wrapper() {
  link_wrapper "${1:-$TOOL_NAME}" "$tool_path/bin"
}

function gem_shell_wrapper () {
  local install_dir
  local ruby_path
  local ruby_version
  local ruby_minor_version
  local tool_name
  local tool_path
  local tool_target
  local tool_wrapper

  install_dir=$(get_install_dir)
  tool_name=${1:-$TOOL_NAME}
  tool_path=$(find_versioned_tool_path)
  tool_wrapper=${install_dir}/bin/${tool_name}
  ruby_path=/usr/local/ruby

  # TODO: make generic
  ruby_version=$(cat $ruby_path/.version)
  if [[ ! "${ruby_version}" =~ ${SEMVER_REGEX} ]]; then
    echo Ruby is not a semver like version - aborting: "${ruby_version}"
    exit 1
  fi

  ruby_minor_version="${BASH_REMATCH[1]}.${BASH_REMATCH[3]}"
  tool_target="${tool_path}/bin/${tool_name}"
  check_command "${tool_target}"
  cat > "$tool_wrapper" <<- EOM
#!/bin/bash

export GEM_PATH=${tool_path}:${ruby_path}/${ruby_version}/lib/ruby/gems/${ruby_minor_version}.0 PATH=${tool_path}/bin:\$PATH

${tool_target} "\$@"
EOM
  chmod 775 "$tool_wrapper"
}
