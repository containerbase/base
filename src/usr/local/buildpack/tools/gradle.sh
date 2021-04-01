#!/bin/bash

set -e

require_root
check_command java

curl -sL -o gradle.zip https://services.gradle.org/distributions/gradle-${TOOL_VERSION}-bin.zip
unzip -d /usr/local gradle.zip
rm gradle.zip

export_path "/usr/local/gradle-${TOOL_VERSION}/bin"

mkdir -p /home/${USER_NAME}/.m2 /home/${USER_NAME}/.gradle

cat > /home/${USER_NAME}/.m2/settings.xml <<- EOM
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                      http://maven.apache.org/xsd/settings-1.0.0.xsd">

</settings>
EOM

cat > /home/${USER_NAME}/.gradle/gradle.properties <<- EOM
org.gradle.parallel=true
org.gradle.configureondemand=true
org.gradle.daemon=false
org.gradle.caching=false
EOM

chown -R ${USER_ID} /home/${USER_NAME}/.m2 /home/${USER_NAME}/.gradle

gradle --version

shell_wrapper gradle
