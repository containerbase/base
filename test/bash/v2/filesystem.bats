setup() {
  load $BATS_SUPPORT_LOAD_PATH
  load $BATS_ASSERT_LOAD_PATH

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../../src/usr/local/containerbase/util.sh"

  # load v2 overrides
  load "$TEST_DIR/../../../src/usr/local/containerbase/utils/v2/overrides.sh"

  # load test overrides
  load "$TEST_DIR/../util.sh"

  # set directories for test
  ROOT_DIR="${TEST_ROOT_DIR}/root"
  BIN_DIR="${TEST_ROOT_DIR}/bin"

  # set default test user
  TEST_ROOT_USER=1000
}

teardown() {
    rm -rf "${TEST_ROOT_DIR}"
}

@test "overwrite: gets the default install dir" {
    TEST_ROOT_USER=1000 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/root"

    TEST_ROOT_USER=0 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/root"
}

@test "overwrite: find_tool_path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run setup_directories
    assert_success

    run find_tool_path
    assert_success
    assert_output ""

    run create_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/root/tools/foo"
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo") -eq 775 ]

    # user
    run find_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/root/tools/foo"

    # root
    local TEST_ROOT_USER=0
    run find_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/root/tools/foo"
}

@test "overwrite: can create a versioned tool path as root" {
    local TEST_ROOT_USER=0

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/root/tools/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/root/tools/foo/1.2.3" ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo") -eq 775 ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo/1.2.3") -eq 755 ]
}

@test "overwrite: can create a versioned tool path as user" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/root/tools/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/root/tools/foo/1.2.3" ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo") -eq 775 ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo/1.2.3") -eq 775 ]
}
