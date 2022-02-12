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

@test "override: gets the default install dir" {
    TEST_ROOT_USER=1000 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/root"

    TEST_ROOT_USER=0 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/root"
}

@test "override: find_tool_path" {
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
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo") -eq 770 ]

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

@test "override: can create a versioned tool path as root" {
    local TEST_ROOT_USER=0

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/root/tools/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/root/tools/foo/1.2.3" ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo") -eq 770 ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo/1.2.3") -eq 750 ]
}

@test "override: can create a versioned tool path as user" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/root/tools/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/root/tools/foo/1.2.3" ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo") -eq 770 ]
    assert [ $(stat --format '%a' "${TEST_ROOT_DIR}/root/tools/foo/1.2.3") -eq 770 ]
}
