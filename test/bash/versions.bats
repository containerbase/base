setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"

  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "can set and get a version" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories
  run set_tool_version

  assert [ -f "${install_dir}/versions/foo" ]

  run get_tool_version foo
  assert_output "1.2.3"

  run get_tool_version
  assert_output "1.2.3"
}

@test "gets the tool version" {
  run get_tool_version_env
  assert_output --partial "No tool defined"
  assert_failure

  run get_tool_version_env foo
  assert_output "FOO_VERSION"

  run get_tool_version_env foo-bar
  assert_output "FOO_BAR_VERSION"
}
