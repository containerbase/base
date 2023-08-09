#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/node.sh"

# Helper function to link to a globally installed node
function prepare_global_config () {
  local prefix=${1}
  prepare_prefix "${prefix}"
  mkdir -p "${versioned_tool_path}/etc"
  echo "prefix = \"${prefix}\"" >> "${versioned_tool_path}/etc/npmrc"
}

# Helper function to link to a user installed node
function prepare_user_config () {
  local prefix=${1}
  if grep -s -q 'prefix' "${USER_HOME}/.npmrc" > /dev/null
  then
    return
  fi

  prepare_prefix "${prefix}"
  echo "prefix = \"${prefix}\"" >> "${USER_HOME}/.npmrc"
  mkdir -p "${USER_HOME}/.npm/_logs"
  chown -R "${USER_ID}" "${prefix}" "${USER_HOME}/.npmrc" "${USER_HOME}/.npm"
  chmod -R g+w "${prefix}" "${USER_HOME}/.npmrc" "${USER_HOME}/.npm"
}

function prepare_prefix () {
  local prefix=${1}
  # npm 7 bug
  mkdir -p "${prefix}"/{bin,lib}
}

function check_tool_requirements () {
  check_semver "$TOOL_VERSION" "minor"
}

function install_tool () {
  local versioned_tool_path
  local arch=${ARCHITECTURE}
  local name=${TOOL_NAME}
  local version=${TOOL_VERSION}
  local version_codename

  local checksum_file
  local expected_checksum
  local githubExists

  version_codename=$(get_distro)
  githubExists=$(file_exists "https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")

  if [[ "${githubExists}" == "200" ]]; then
    checksum_file=$(get_from_url "https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")
    # get checksum from file
    expected_checksum=$(cat "${checksum_file}")
    # download file
    file=$(get_from_url \
      "https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz" \
      "${name}-${version}-${version_codename}-${arch}.tar.xz" \
      "${expected_checksum}" \
      "sha512sum" )
  else
    # fallback to nodejs.org
    arch=x64
    if [[ "${ARCHITECTURE}" == "aarch64" ]]; then
      arch=arm64
    fi

    checksum_file=$(get_from_url "https://nodejs.org/dist/v${version}/SHASUMS256.txt")
    # get checksum from file
    expected_checksum=$(grep "${name}-v${version}-${arch}.tar.xz" "${checksum_file}" | cut -d' ' -f1)
    # download file
    file=$(get_from_url \
      "https://nodejs.org/dist/v${version}/${name}-v${version}-linux-${arch}.tar.xz" \
      "${name}-v${version}-linux-${arch}.tar.xz" \
      "${expected_checksum}" \
      "sha256sum" )
  fi

  if [[ -z "$file" ]]; then
    echo "Download failed" >&2
    exit 1;
  fi

  versioned_tool_path=$(create_versioned_tool_path)

  # extract
  tar -C "${versioned_tool_path}" --strip 1 -xf "${file}"

  # init temp dir
  npm_init


  if [[ $(is_root) -eq 0 ]]; then
    # redirect root install
    prepare_global_config /usr/local

    # redirect user install
    prepare_user_config "${USER_HOME}/.npm-global"
  else
    # redirect user install
    prepare_global_config "${USER_HOME}/.npm-global"
  fi

  if [[ ${MAJOR} -lt 15 ]]; then
    echo "updating node-gyp"
    # update to latest node-gyp to fully support python3
    PATH=${versioned_tool_path}/bin:$PATH NODE_OPTIONS=--use-openssl-ca \
      npm explore npm -g --prefix "$versioned_tool_path" --silent -- "npm" install node-gyp@latest --no-audit --cache "${NPM_CONFIG_CACHE}" --silent 2>&1
  fi

  # clean temp dir
  npm_clean
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  local tool_env

  reset_tool_env

  post_install

  export_tool_path "${USER_HOME}/.npm-global/bin"
  export_tool_env NO_UPDATE_NOTIFIER 1
  export_tool_env npm_config_update_notifier false
  export_tool_env npm_config_fund false

  tool_env=$(find_tool_env)

  # if not root, set the npm prefix config option to the user folder
  cat >> "$tool_env" <<- EOM
# openshift override unknown user home
if [ "\${EUID}" != 0 ] && [ "\${EUID}" != ${USER_ID} ]; then
  export npm_config_prefix="${USER_HOME}/.npm-global"
fi
EOM

  [[ -n $SKIP_VERSION ]] || echo "node: $(node --version) $(command -v node)"
  [[ -n $SKIP_VERSION ]] || echo "npm: $(npm --version)  $(command -v npm)"
  if [[ -n $SKIP_VERSION && -e "${versioned_tool_path}/bin/corepack" ]];then
    echo "corepack: $(corepack --version)  $(command -v corepack)"
  fi
}



function post_install () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin" "NODE_OPTIONS=\"\$NODE_OPTIONS --use-openssl-ca\""
  shell_wrapper npm "${versioned_tool_path}/bin"
  shell_wrapper npx "${versioned_tool_path}/bin"
  if [[ -e "${versioned_tool_path}/bin/corepack" ]];then
    shell_wrapper corepack "${versioned_tool_path}/bin"
  fi
}
