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

    # set default test user
    TEST_ROOT_USER=1000
}

teardown() {
    rm -rf "${TEST_ROOT_DIR}"
}

@test "gets the default install dir" {
    TEST_ROOT_USER=1000 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/user"

    TEST_ROOT_USER=0 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/root"
}

@test "can create a versioned tool path as user" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/user/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/user/foo/1.2.3" ]
}

@test "can create a versioned tool path as root" {
    local TEST_ROOT_USER=0

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/root/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/root/foo/1.2.3" ]
}

@test "finds the versioned tool path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run find_versioned_tool_path
    assert_output ""

    # user
    run create_versioned_tool_path
    run find_versioned_tool_path
    assert_output "${TEST_ROOT_DIR}/user/foo/1.2.3"

    # root
    local TEST_ROOT_USER=0
    run create_versioned_tool_path
    run find_versioned_tool_path
    assert_output "${TEST_ROOT_DIR}/root/foo/1.2.3"

}

@test "finds the tool path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run find_tool_path
    assert_success
    assert_output ""

    # user
    mkdir -p "${TEST_ROOT_DIR}/user/foo"
    run find_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/user/foo"

    # root
    local TEST_ROOT_USER=0
    mkdir -p "${TEST_ROOT_DIR}/root/foo"
    run find_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/root/foo"
}

@test "finds the tool env path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    # user
    run find_tool_env
    assert_output "${TEST_ROOT_DIR}/user/env.d/foo.sh"

    # root
    local TEST_ROOT_USER=0
    run find_tool_env
    assert_output "${TEST_ROOT_DIR}/root/env.d/foo.sh"

    TOOL_NAME= run find_tool_env
    assert_failure
}
