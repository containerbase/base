# shellcheck disable=SC2148,SC2155

setup() {
  load "$BATS_SUPPORT_LOAD_PATH"
  load "$BATS_ASSERT_LOAD_PATH"

    TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
    TEST_ROOT_DIR=$(mktemp -u)

    load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"

    # load test overwrites
    load "$TEST_DIR/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "set and get versions" {

  run setup_directories
  assert_success

  run get_tool_version foo
  assert_success
  assert_output ""

  run set_tool_version
  assert_failure

  TOOL_NAME=foo TOOL_VERSION='' \
  run set_tool_version
  assert_failure

  TOOL_NAME='' TOOL_VERSION='' \
  run set_tool_version
  assert_failure

  run set_tool_version foo
  assert_failure

  run set_tool_version "" 1.2.3
  assert_failure

  TOOL_NAME=foo TOOL_VERSION=1.2.3 \
  run set_tool_version
  assert_success

  TOOL_NAME=foo TOOL_VERSION=1.2.3 \
  run get_tool_version
  assert_success
  assert_output "1.2.3"

  TOOL_NAME=foo TOOL_VERSION=1.2.4 \
  run set_tool_version foobar
  assert_success

  TOOL_NAME=foo TOOL_VERSION=1.2.4 \
  run get_tool_version foobar
  assert_success
  assert_output "1.2.4"

  TOOL_NAME=foo TOOL_VERSION=1.2.4 \
  run set_tool_version foobar1 1.2.5
  assert_success

  TOOL_NAME=foo TOOL_VERSION=1.2.4 \
  run get_tool_version foobar1
  assert_success
  assert_output "1.2.5"

  TOOL_NAME=bar TOOL_VERSION=1.2.4 \
  run set_tool_version "" 1.1.1
  assert_success

  TOOL_NAME=bar TOOL_VERSION=1.2.4 \
  run get_tool_version
  assert_success
  assert_output "1.1.1"
}

@test "can set version with different umask" {
  local version_path=$(get_version_path)

  run setup_directories
  assert_success

  touch "${version_path}/foo"
  chmod 777 "${version_path}/foo"

  run set_tool_version foo 1.2.3
  assert_success

  run get_tool_version foo
  assert_success
  assert_output "1.2.3"

  assert [ "$(stat --format '%a' "${version_path}/foo")" -eq 777 ]

  run set_tool_version bar 1.2.4
  assert_success

  run get_tool_version bar
  assert_success
  assert_output "1.2.4"

  assert [ "$(stat --format '%a' "${version_path}/bar")" -eq 660 ]
}

@test "get_tool_version_env" {

  run get_tool_version_env
  assert_failure

  run get_tool_version_env ""
  assert_failure

  run get_tool_version_env foo-bar
  assert_success
  assert_output "FOO_BAR_VERSION"

  run get_tool_version_env foo
  assert_success
  assert_output "FOO_VERSION"

  run get_tool_version_env foo---bar
  assert_success
  assert_output "FOO___BAR_VERSION"
}
