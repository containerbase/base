
setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

    TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
    TEST_ROOT_DIR=$(mktemp -u)

    load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"

    # load test overwrites
    load "$TEST_DIR/util.sh"

    # set directories for test
    ROOT_DIR="${TEST_ROOT_DIR}/root"
    USER_HOME="${TEST_ROOT_DIR}/user"
    ENV_FILE="${TEST_ROOT_DIR}/env"

    # set default test user
    TEST_ROOT_USER=1000
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "set and get versions" {

  setup_directories

  run set_tool_version
  assert_failure

  TOOL_NAME=foo TOOL_VERSION= \
  run set_tool_version
  assert_failure

  TOOL_NAME= TOOL_VERSION= \
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
