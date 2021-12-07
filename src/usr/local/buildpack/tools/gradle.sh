#!/bin/bash

set -e

check_command java

if [[ "${TOOL_VERSION}" == "latest" ]]; then
  export "TOOL_VERSION=$(curl -s https://services.gradle.org/versions/current | jq --raw-output '.version')"
fi

check_semver ${TOOL_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_path "${1}/bin"
}

function create_gradle_settings() {
  if [[ -f ${USER_HOME}/.gradle/gradle.properties ]]; then
    echo 'Gradle settings already found'
    return
  fi
  echo 'Creating Gradle settings'
  mkdir -p ${USER_HOME}/.gradle

  cat > ${USER_HOME}/.gradle/gradle.properties <<- EOM
org.gradle.parallel=true
org.gradle.configureondemand=true
org.gradle.daemon=false
org.gradle.caching=false
EOM

  chown -R ${USER_ID} ${USER_HOME}/.gradle
}

function create_maven_settings() {
  if [[ -f ${USER_HOME}/.m2/settings.xml ]]; then
    echo 'Maven settings already found'
    return
  fi
  echo 'Creating Maven settings'
  mkdir -p ${USER_HOME}/.m2
  cat > ${USER_HOME}/.m2/settings.xml <<- EOM
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                      http://maven.apache.org/xsd/settings-1.0.0.xsd">

</settings>
EOM

  chown -R ${USER_ID} ${USER_HOME}/.m2
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${base_path}

  create_maven_settings
  create_gradle_settings

  file=/tmp/gradle.zip

  URL="https://services.gradle.org/distributions"

  curl -sSfLo ${file} ${URL}/gradle-${TOOL_VERSION}-bin.zip
  unzip -q -d ${base_path} ${file}
  rm ${file}
  mv ${base_path}/${TOOL_NAME}-${TOOL_VERSION} ${tool_path}

  update_env ${tool_path}
  shell_wrapper gradle
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

gradle --version
