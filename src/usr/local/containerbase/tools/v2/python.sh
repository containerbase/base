#!/bin/bash

# sets the correct shebang for python
fix_python_shebangs() {
  # https://github.com/koalaman/shellcheck/wiki/SC2044
  while IFS= read -r -d '' file
  do
    case "$(head -1 "${file}")" in
    "#!"*"/bin/python" )
      sed -i "1 s:.*:#\!${versioned_tool_path}\/bin\/python:" "${file}"
      ;;
    "#!"*"/bin/python${MAJOR}" )
      sed -i "1 s:.*:#\!${versioned_tool_path}\/bin\/python${MAJOR}:" "${file}"
      ;;
    "#!"*"/bin/python${MAJOR}.${MINOR}" )
      sed -i "1 s:.*:#\!${versioned_tool_path}\/bin\/python${MAJOR}.${MINOR}:" "${file}"
      ;;
    esac
  done < <(find "${versioned_tool_path}/bin" -type f -exec grep -Iq . {} \; -print0)
}

function prepare_tool() {
  local tool_path
  tool_path=$(create_tool_path)

  # Workaround for compatibillity for Python hardcoded paths
  if [ "${tool_path}" != "${ROOT_DIR_LEGACY}/python" ]; then
    ln -sf "${tool_path}" /usr/local/python
  fi
  export_path "${USER_HOME}/.local/bin"
  export_env PIP_DISABLE_PIP_VERSION_CHECK 1
}

function install_tool () {
  local tool_path
  local versioned_tool_path
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

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${name} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"
  version_codename=$(get_distro)

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

  bsdtar -C "${tool_path}" -xf "${file}"

  versioned_tool_path=$(find_versioned_tool_path)

  fix_python_shebangs

  # install latest pip and virtualenv
  PIP_ROOT_USER_ACTION=ignore PIP_USE_PEP517=true "${versioned_tool_path}/bin/python" \
    -W ignore \
    -m pip \
      install \
      --compile \
      --no-warn-script-location \
      --no-cache-dir \
      --quiet \
      --upgrade \
      pip \
      virtualenv \
      ;
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  reset_tool_env

  # export python vars
  export_tool_path "${versioned_tool_path}/bin"

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  shell_wrapper "${TOOL_NAME}${MAJOR}" "${versioned_tool_path}/bin"
  shell_wrapper "${TOOL_NAME}${MAJOR}.${MINOR}" "${versioned_tool_path}/bin"
  shell_wrapper pip "${versioned_tool_path}/bin"
  shell_wrapper "pip${MAJOR}" "${versioned_tool_path}/bin"
  shell_wrapper "pip${MAJOR}.${MINOR}" "${versioned_tool_path}/bin"

  [[ -n $SKIP_VERSION ]] || python --version
  [[ -n $SKIP_VERSION ]] || PYTHONWARNINGS=ignore pip --version
}
