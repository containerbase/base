#!/bin/bash

export NEEDS_PREPARE=1

function prepare_tool() {
  local go_path
  # go suggests: git svn bzr mercurial
  apt_install bzr mercurial

  init_tool

  go_path=$(get_cache_path)/go

  ln -sf "${go_path}" "${USER_HOME}/go"
}

function init_tool() {
  local go_path

  go_path=$(get_cache_path)/go

  if [ -d "${go_path}" ]; then
    return
  fi

  create_folder "${go_path}/src" 775
  create_folder "${go_path}/bin" 775
  create_folder "${go_path}/pkg" 775
  chown -R "${USER_ID}" "${go_path}"
}

function install_tool () {
  local arch=${ARCHITECTURE}
  local base_url
  local checksum_file
  local expected_checksum
  local file
  local fversion
  local name=${TOOL_NAME}
  local version=${TOOL_VERSION}
  local versioned_tool_path

  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"

  # not all releases are copied to github
  checksum_exists=$(file_exists "${base_url}/${version}/${name}-${version}-${arch}.tar.xz.sha512")
  if [[ "${checksum_exists}" == "200" ]]; then
    checksum_file=$(get_from_url "${base_url}/${version}/${name}-${version}-${arch}.tar.xz.sha512")
    # get checksum from file
    expected_checksum=$(cat "${checksum_file}")
    # download file
    file=$(get_from_url \
      "${base_url}/${version}/${name}-${version}-${arch}.tar.xz" \
      "${name}-${version}-${arch}.tar.xz" \
      "${expected_checksum}" \
      sha512sum
      )
    if [[ -z "$file" ]]; then
      echo "Download failed" >&2
      exit 1;
    fi
    bsdtar -C "$(find_tool_path)" -xf "${file}"
  else

    # fix version, only for go 1.20 and below
    fversion=${TOOL_VERSION}
    if [[ ($MAJOR -lt 1 || ($MAJOR -eq 1 && $MINOR -lt 21)) && "${PATCH}" == "0" ]]; then
      fversion="${MAJOR}.${MINOR}"
    fi

    if [[ "${arch}" = "aarch64" ]]; then
      arch=arm64
    else
      arch=amd64
    fi

    now=$(date +%Y%m%d%H) # cache for one hour
    checksum_file=$(get_from_url "https://go.dev/dl/?mode=json&include=all&_=${now}" "go-versions.${now}.json")
    expected_checksum="$(jq -r ".[] | select(.version == \"go${fversion}\") | .files[] | select(.os == \"linux\" and .arch == \"${arch}\") | .sha256" < "${checksum_file}")"

    file=$(get_from_url \
      "https://dl.google.com/go/go${fversion}.linux-${arch}.tar.gz" \
      "${name}-${version}-${arch}.tar.gz" \
      "${expected_checksum}" \
      sha256sum
      )

    if [[ -z "$file" ]]; then
      echo "Download failed" >&2
      exit 1;
    fi
    versioned_tool_path=$(create_versioned_tool_path)
    bsdtar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
  fi
}

function link_tool () {
  local versioned_tool_path

  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper go "${versioned_tool_path}/bin" "GOBIN=\${GOBIN-${BIN_DIR}}"

  go version
  go env
}
