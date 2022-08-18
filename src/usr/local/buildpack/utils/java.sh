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
}


function get_java_install_url () {
  local arch=x64
  local url
  local baseUrl=https://api.adoptium.net/v3/assets/version
  local apiArgs='heap_size=normal&os=linux&page=0&page_size=1&project=jdk'
  local version=${1}
  local type=${2}

  url=$(curl -sSLf -H 'accept: application/json' "${baseUrl}/${version}?architecture=${arch}&image_type=${type}&${apiArgs}" \
    | jq --raw-output '.[0].binaries[0].package.link')
  echo "${url}"
}

function install_java () {
  local versioned_tool_path
  local file
  local url
  local type=${1}

  versioned_tool_path=$(create_versioned_tool_path)
  url=$(get_java_install_url "${TOOL_VERSION}" "${type}")
  file=$(get_from_url "${url}")
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
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
