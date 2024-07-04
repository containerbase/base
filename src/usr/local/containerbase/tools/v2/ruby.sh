#!/bin/bash

function prepare_tool() {
  local version_codename
  local tool_path
  local path

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

  # Redirect gemrc
  path="$(get_home_path)/.gemrc"
  {
    printf -- "gem: --no-document\n"
  } > "${path}"
  chown "${USER_ID}" "${path}"
  chmod g+w "${path}"
  ln -sf "${path}" "${USER_HOME}/.gemrc"

  # Redirect gem home
  path="$(get_home_path)/.gem"
  create_folder "${path}" 775
  chown  "${USER_ID}" "${path}"
  chmod g+w "${path}"
  ln -sf "${path}" "${USER_HOME}/.gem"

  # Redirect cocoapods home
  path="$(get_home_path)/.cocoapods"
  create_folder "${path}" 775
  chown  "${USER_ID}" "${path}"
  chmod g+w "${path}"
  ln -sf "${path}" "${USER_HOME}/.cocoapods"

  # Redirect Library home
  path="$(get_home_path)/Library"
  create_folder "${path}" 775
  chown  "${USER_ID}" "${path}"
  chmod g+w "${path}"
  ln -sf "${path}" "${USER_HOME}/Library"

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

  # not all releases have checksums
  checksum_exists=$(file_exists "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")
  if [[ "${checksum_exists}" == "200" ]]; then
    checksum_file=$(get_from_url "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")
    # get checksum from file
    expected_checksum=$(cat "${checksum_file}")
  fi

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
    printf -- "gem: --no-document\n"
    printf -- ":benchmark: false\n"
    printf -- ":verbose: true\n"
    printf -- ":update_sources: true\n"
    printf -- ":backtrace: false\n"
  } > "$versioned_tool_path/etc/gemrc"

}

function link_tool () {
  local versioned_tool_path

  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper ruby "${versioned_tool_path}/bin"
  shell_wrapper gem "${versioned_tool_path}/bin"

  [[ -n $SKIP_VERSION ]] || ruby --version
  [[ -n $SKIP_VERSION ]] || echo "gem $(gem --version)"
  [[ -n $SKIP_VERSION ]] || gem env
}
