# shellcheck disable=SC2034,SC2148

setup() {
  load "$BATS_SUPPORT_LOAD_PATH"
  load "$BATS_ASSERT_LOAD_PATH"

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"

  # load v2 overwrites
  load "$TEST_DIR/../../src/usr/local/containerbase/utils/v2/overrides.sh"

  # load test overwrites
  load "$TEST_DIR/util.sh"

  setup_directories

  # copy containerbase files
  cp -r "$TEST_DIR/../../src/usr/local/containerbase" "${ROOT_DIR}/containerbase"

  # load java
  load "$TEST_DIR/../../src/usr/local/containerbase/utils/java.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "create_gradle_settings" {
  run create_gradle_settings
  assert_success
  assert_output "Creating Gradle settings"

  run create_gradle_settings
  assert_success
  assert_output "Gradle settings already found"

  assert [ "$(stat --format '%a' "${USER_HOME}/.gradle")" -eq 775 ]
  assert [ "$(stat --format '%a' "${USER_HOME}/.gradle/gradle.properties")" -eq 664 ]
}

@test "create_maven_settings" {
  run create_maven_settings
  assert_success
  assert_output "Creating Maven settings"

  run create_maven_settings
  assert_success
  assert_output "Maven settings already found"

  assert [ "$(stat --format '%a' "${USER_HOME}/.m2")" -eq 775 ]
  assert [ "$(stat --format '%a' "${USER_HOME}/.m2/settings.xml")" -eq 664 ]
}
