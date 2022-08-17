#!/bin/bash

function create_gradle_settings() {
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

function create_maven_settings() {
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
