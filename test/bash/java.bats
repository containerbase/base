# shellcheck disable=SC2034,SC2148

setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"

  # load v2 overwrites
  load "$TEST_DIR/../../src/usr/local/containerbase/utils/v2/overrides.sh"

  # load test overwrites
  load "$TEST_DIR/util.sh"

  # set directories for test
  ROOT_DIR="${TEST_ROOT_DIR}/root"
  BIN_DIR="${TEST_ROOT_DIR}/bin"
  USER_HOME="${TEST_ROOT_DIR}/user"
  ENV_FILE="${TEST_ROOT_DIR}/env"

  setup_directories

  # copy containerbase files
  cp -r "$TEST_DIR/../../src/usr/local/containerbase" "${ROOT_DIR}/containerbase"

  # set default test user is root
  TEST_ROOT_USER=1000
  # load helm
  load "$TEST_DIR/../../src/usr/local/containerbase/utils/java.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "patch_java_version" {
  run patch_java_version 18.0.2+101
  assert_success
  assert_output "18.0.2.1+1"

  run patch_java_version 18.0.2+9
  assert_success
  assert_output "18.0.2+9"

  run patch_java_version 11.0.14+101
  assert_success
  assert_output "11.0.14.1+1"

  run patch_java_version 8.0.345+1
  assert_success
  assert_output "8.0.345+1"
}


@test "get_java_install_url" {

  run get_java_install_url 18.0.2+9 jre
  assert_success
  assert_output "https://github.com/adoptium/temurin18-binaries/releases/download/jdk-18.0.2%2B9/OpenJDK18U-jre_x64_linux_hotspot_18.0.2_9.tar.gz"

  run get_java_install_url 8.0.345+1 jre
  assert_success
  assert_output "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u345-b01/OpenJDK8U-jre_x64_linux_hotspot_8u345b01.tar.gz"

  run get_java_install_url 18.0.2+101 jre
  assert_success
  assert_output "https://github.com/adoptium/temurin18-binaries/releases/download/jdk-18.0.2.1%2B1/OpenJDK18U-jre_x64_linux_hotspot_18.0.2.1_1.tar.gz"

  run get_java_install_url 11.0.14+101 jre
  assert_success
  assert_output "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.14.1%2B1/OpenJDK11U-jre_x64_linux_hotspot_11.0.14.1_1.tar.gz"

  run get_java_install_url 11.0.14+102 jre
  assert_failure
  assert_output "Invalid java version: 11.0.14+102"

  run get_java_install_url
  assert_failure
  assert_output "Missing Java version"
}


@test "get_latest_java_version" {
  run get_latest_java_version
  assert_success
  assert_output --regexp '^[0-9]+\.[0-9]+\.[0-9]+\+[0-9]+'
}

@test "create_gradle_settings" {
  run create_gradle_settings
  assert_success
  assert_output "Creating Gradle settings"

  run create_gradle_settings
  assert_success
  assert_output "Gradle settings already found"

  assert [ $(stat --format '%a' "${USER_HOME}/.gradle") -eq 775 ]
  assert [ $(stat --format '%a' "${USER_HOME}/.gradle/gradle.properties") -eq 664 ]
}

@test "create_maven_settings" {
  run create_maven_settings
  assert_success
  assert_output "Creating Maven settings"

  run create_maven_settings
  assert_success
  assert_output "Maven settings already found"

  assert [ $(stat --format '%a' "${USER_HOME}/.m2") -eq 775 ]
  assert [ $(stat --format '%a' "${USER_HOME}/.m2/settings.xml") -eq 664 ]
}
