#!/bin/bash

function create_gradle_settings () {
  if [[ -f ${USER_HOME}/.gradle/gradle.properties ]]; then
    echo 'Gradle settings already found'
    return
  fi
  echo 'Creating Gradle settings'
  mkdir -p "${USER_HOME}/.gradle"

  cat > "${USER_HOME}/.gradle/gradle.properties" <<- EOM
org.gradle.parallel=true
org.gradle.configureondemand=true
org.gradle.daemon=false
org.gradle.caching=false
EOM

  chown -R "${USER_ID}" "${USER_HOME}/.gradle"
  chmod -R g+w "${USER_HOME}/.gradle"
}

function create_maven_settings () {
  if [[ -f ${USER_HOME}/.m2/settings.xml ]]; then
    echo 'Maven settings already found'
    return
  fi
  echo 'Creating Maven settings'
  mkdir -p "${USER_HOME}/.m2"

  cat > "${USER_HOME}/.m2/settings.xml" <<- EOM
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                      http://maven.apache.org/xsd/settings-1.0.0.xsd">

</settings>
EOM

  chown -R "${USER_ID}" "${USER_HOME}/.m2"
  chmod -R g+w "${USER_HOME}/.m2"
}

function get_java_install_url () {
  local arch
  local json
  local base_url=https://api.adoptium.net/v3/assets/version
  local api_args='heap_size=normal&os=linux&page=0&page_size=1&project=jdk'
  local version=${1}
  local type=${2:-jre}
  local patched_version

  if [ -z "${version}" ]; then
    echo "Missing Java version"
    exit 1
  fi

  # https://github.com/adoptium/api.adoptium.net/issues/468
  arch=$(uname -m)
  # https://github.com/adoptium/api.adoptium.net/issues/492
  patched_version=$(patch_java_version "$version")

  if ! json=$(curl -sSLf -H 'accept: application/json' "${base_url}/${version}?architecture=${arch}&image_type=${type}&${api_args}" 2>&1) && [ "$patched_version" != "$version" ]; then
    if ! json=$(curl -sSLf -H 'accept: application/json' "${base_url}/${patched_version}?architecture=${arch}&image_type=${type}&${api_args}" 2>&1); then
      echo "Invalid java version: $version" >&2
      exit 1
    fi
  fi

  echo "${json}" | jq --raw-output '.[0].binaries[0].package.link'
}

function install_java () {
  local versioned_tool_path
  local file
  local url
  local type=${1:-jre}
  local ssl_dir

  ssl_dir=$(get_ssl_path)

  if [[ ! -f "${ssl_dir}/cacerts" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
  fi

  versioned_tool_path=$(create_versioned_tool_path)
  url=$(get_java_install_url "${TOOL_VERSION}" "${type}")
  file=$(get_from_url "${url}")
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
  if [[ "$type" = "jdk" ]] && [[ "${MAJOR}" -eq 8 ]]; then
    ln -sf "${ssl_dir}/cacerts" "${versioned_tool_path}/jre/lib/security/cacerts"
  else
    ln -sf "${ssl_dir}/cacerts" "${versioned_tool_path}/lib/security/cacerts"
  fi
}

function link_java () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper java "${versioned_tool_path}/bin"

# TODO: check if still needed
#  reset_tool_env
#  export_tool_env JAVA_HOME "${versioned_tool_path}"

  java -version
}

function prepare_java () {
  local ssl_dir
  local url
  local version
  local file

  ssl_dir=$(get_ssl_path)

  if [[ -f "${ssl_dir}/cacerts" ]]; then
    # cert store already there
    return
  fi

  version=$(get_latest_java_version jre)
  url=$(get_java_install_url "${version}" jre)
  file=$(get_from_url "${url}")

  mkdir -p "${TEMP_DIR}/java"
  tar --strip 1 -C "${TEMP_DIR}/java" -xf "${file}"
  cp "${TEMP_DIR}/java/lib/security/cacerts" "${ssl_dir}/cacerts"
  rm -rf "${TEMP_DIR}/java"
}

function get_latest_java_version () {
  local arch
  local version
  local base_url=https://api.adoptium.net/v3/info/release_versions
  local api_args='heap_size=normal&os=linux&page=0&page_size=1&project=jdk&release_type=ga&lts=true'
  local type=${1:-jre}

  # https://github.com/adoptium/api.adoptium.net/issues/468
  arch=$(uname -m)
  curl -sSLf -H 'accept: application/json' "${base_url}?architecture=${arch}&image_type=${type}&${api_args}" \
    | jq --raw-output '.versions[0].semver'
}

# https://github.com/adoptium/api.adoptium.net/issues/492
function patch_java_version () {
  local version=${1}
  if [[ "${version}" =~ ^((0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))\+([1-9])([0-9][0-9])$ ]]; then
    local build=${BASH_REMATCH[5]}
    local meta=${BASH_REMATCH[6]}
    version="${BASH_REMATCH[1]}.$build+$((meta + 0))"
  fi
  echo "${version}"
}
