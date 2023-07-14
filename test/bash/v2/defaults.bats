setup() {
  load $BATS_SUPPORT_LOAD_PATH
  load $BATS_ASSERT_LOAD_PATH

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../../src/usr/local/containerbase/util.sh"

  # load v2 overwrites
  load "$TEST_DIR/../../../src/usr/local/containerbase/utils/v2/overrides.sh"

  # load test overwrites
  load "$TEST_DIR/../util.sh"

  # set directories for test
  ROOT_DIR="${TEST_ROOT_DIR}/root"

  # set default test user
  TEST_ROOT_USER=1000
}

teardown() {
    rm -rf "${TEST_ROOT_DIR}"
}

@test "overwrite: test default functions" {

  run check_tool_requirements
  assert_failure
  assert_output --partial "Not a semver like version"

  TOOL_VERSION=1.2.3
  run check_tool_requirements
  assert_success

  run check_tool_installed
  assert_failure

  TOOL_NAME=foo \
  TOOL_VERSION=1.2.3
  run check_tool_installed
  assert_failure

  TOOL_NAME=foo \
  TOOL_VERSION=1.2.3
  run create_versioned_tool_path
  assert_success

  TOOL_NAME=foo \
  TOOL_VERSION=1.2.3
  run check_tool_installed
  assert_success

  run install_tool
  assert_failure
  assert_output --partial "not defined"

  run link_tool
  assert_failure
  assert_output --partial "not defined"

  run prepare_tool
  assert_success
  assert_output --partial "not defined"
}
