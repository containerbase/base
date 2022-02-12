setup() {
  load '../../../node_modules/bats-support/load'
  load '../../../node_modules/bats-assert/load'

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../../src/usr/local/buildpack/util.sh"

  # load v2 overrides
  load "$TEST_DIR/../../../src/usr/local/buildpack/utils/v2/overrides.sh"

  # load test overrides
  load "$TEST_DIR/../util.sh"

  # set directories for test
  ROOT_DIR="${TEST_ROOT_DIR}/root"

  # set default test user
  TEST_ROOT_USER=1000
}

teardown() {
    rm -rf "${TEST_ROOT_DIR}"
}

@test "override: test default functions" {

  run check_tool_requirements
  assert_failure
  assert_output --partial "not defined"

  run check_tool_installed
  assert_failure
  assert_output --partial "not defined"

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
