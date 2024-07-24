#!/bin/bash

function prepare_tool() {
  local version_codename
  local tool_path

  version_codename="$(get_distro)"
  case "${version_codename}" in
    "focal");;
    "jammy");;
    "noble");;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac
  apt_install \
    g++ \
    libffi-dev \
    libyaml-0-2 \
    make \
    ;
  tool_path=$(create_tool_path)

  {
    printf -- "gem: --bindir %s/bin --no-document\n" "${USER_HOME}"
  } > "${USER_HOME}"/.gemrc
  chown -R "${USER_ID}" "${USER_HOME}"/.gemrc
  chmod -R g+w "${USER_HOME}"/.gemrc

  # Workaround for compatibillity for Ruby hardcoded paths
  if [ "${tool_path}" != "${ROOT_DIR_LEGACY}/ruby" ]; then
    ln -sf "${tool_path}" /usr/local/ruby
  fi
}

function install_tool () {
  local arch
  local base_url
  local checksum_file
  local expected_checksum
  local file
  local name=${TOOL_NAME}
  local tool_path
  local version=${TOOL_VERSION}
  local version_codename
  local versioned_tool_path

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  arch=$(uname -p)
  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"
  version_codename=$(get_distro)

  if [[ "${version_codename}" == "noble" ]]; then
    version_codename="jammy"
  fi

  checksum_file=$(get_from_url "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")
  expected_checksum=$(cat "${checksum_file}")

  file=$(get_from_url \
    "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz" \
    "${name}-${version}-${version_codename}-${arch}.tar.xz" \
    "${expected_checksum}" \
    sha512sum
    )

  bsdtar -C "${tool_path}" -xf "${file}"

  versioned_tool_path=$(find_versioned_tool_path)
  # System settings
  mkdir -p "$versioned_tool_path/etc"
  {
    printf -- "gem: --bindir /usr/local/bin --no-document\n"
    printf -- ":benchmark: false\n"
    printf -- ":verbose: true\n"
    printf -- ":update_sources: true\n"
    printf -- ":backtrace: false\n"
  } > "$versioned_tool_path/etc/gemrc"

}

function link_tool () {
  local tool_path
  local versioned_tool_path
  local ruby_minor_version

  tool_path=$(find_tool_path)
  versioned_tool_path=$(find_versioned_tool_path)
  ruby_minor_version="${MAJOR}.${MINOR}.0"

  reset_tool_env
  # export ruby varsreset_tool_env
  {
    printf -- "if [ \"\${EUID}\" != 0 ] && [ -z \"\$GEM_HOME\" ]; then\n"
    printf -- "  export GEM_HOME=\"%s/.gem/ruby/%s\"\n" "${USER_HOME}" "${ruby_minor_version}"
    printf -- "fi\n"
  } >> "$(find_tool_env)"

  shell_wrapper ruby "${versioned_tool_path}/bin"
  shell_wrapper gem "${versioned_tool_path}/bin"

  [[ -n $SKIP_VERSION ]] || ruby --version
  [[ -n $SKIP_VERSION ]] || echo "gem $(gem --version)"
  [[ -n $SKIP_VERSION ]] || gem env
}
