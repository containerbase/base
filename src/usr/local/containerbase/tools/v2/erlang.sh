#!/bin/bash

SEMVER_REGEX_ERLANG="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\+[0-9]+)?([a-z-].*)?$"

export NEEDS_PREPARE=1

function check_semver_erlang () {
  if [[ ! "${1}" =~ ${SEMVER_REGEX_ERLANG} ]]; then
    echo Not a semver like version - aborting: "${1}"
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}
  export BUILD=${BASH_REMATCH[7]}
}

function check_tool_requirements () {
  check_semver_erlang "${TOOL_VERSION}"
  if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" || ! "${BUILD}" ]]; then
    echo Invalid version: "${TOOL_VERSION}"
    exit 1
  fi

  local version_codename
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
}

function prepare_tool() {
  local tool_path
  tool_path=$(find_tool_path)
  # Workaround for compatibillity for Erlang hardcoded paths, works for v22+
  if [ "${tool_path}" != "${ROOT_DIR_LEGACY}/erlang" ]; then
    ln -sf "${tool_path}" /usr/local/erlang
  fi
}

function install_tool () {
  local tool_path
  local file
  local base_url
  local arch=${ARCHITECTURE}
  local name=${TOOL_NAME}
  local version=${TOOL_VERSION}
  local version_codename
  local checksum_file
  local expected_checksum
  local checksum_exists

  tool_path=$(find_tool_path)

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

  # download file
  file=$(get_from_url \
    "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz" \
    "${name}-${version}-${version_codename}-${arch}.tar.xz" \
    "${expected_checksum}" \
    sha512sum
    )

  if [[ -z "$file" ]]; then
    echo "Download failed" >&2
    exit 1;
  fi

  # extract file
  tar -C "${tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  # only works for v24+
  #export_tool_env ERL_ROOTDIR "${versioned_tool_path}"
  shell_wrapper erl "${versioned_tool_path}/bin"
  erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell
}
