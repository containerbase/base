
setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

    TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
    TEST_ROOT_DIR=$(mktemp -u)

    load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"

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
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "prepare-tool" {
  run prepare_tools
  assert_failure
  assert_output "param TOOL_NAME is set but empty"

  run prepare_tools foobar
  assert_failure
  assert_output "This script must be run as root"

  TEST_ROOT_USER=0 \
  CONTAINERBASE_DEBUG=1 \
  run prepare_tools foobar2
  assert_failure
  assert_output "tool foobar2 does not exist"
}
