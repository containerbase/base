setup() {
    load '../../node_modules/bats-support/load'
    load '../../node_modules/bats-assert/load'

    TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
    TEST_ROOT_DIR=$(mktemp -u)
    USER_HOME=$TEST_ROOT_DIR

    load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
    rm -rf "${TEST_ROOT_DIR}"
}

@test "gets the default install dir" {
    unset TEST_ROOT_DIR
    run get_install_dir

    if [[ $EUID -eq 0 ]]; then
        assert_output "/opt/buildpack"
    else
        assert_output "${USER_HOME}"
    fi
}

@test "can create a versioned tool path as user" {
    local install_dir=$(get_install_dir)

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    local TEST_ROOT_USER=1000

    run setup_directories
    run create_versioned_tool_path

    assert_output "${install_dir}/foo/1.2.3"
    assert [ -d "${install_dir}/foo/1.2.3" ]
}

@test "finds the versioned tool path" {
    local install_dir=$(get_install_dir)

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run find_versioned_tool_path
    assert_output ""

    run create_versioned_tool_path
    run find_versioned_tool_path
    assert_output "${install_dir}/foo/1.2.3"
}

@test "finds the tool path" {
    local install_dir=$(get_install_dir)

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run setup_directories
    run find_tool_path
    assert_success
    assert_output ""

    mkdir -p "${install_dir}/foo"
    run find_tool_path
    assert_success
    assert_output "${install_dir}/foo"
}

@test "finds the tool env path" {
    local install_dir=$(get_install_dir)

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run setup_directories

    run find_tool_env
    assert_output "${install_dir}/env.d/foo.sh"

    # TODO(Chumper): This should fail
    TOOL_NAME= run find_tool_env
    #   assert_failure
    assert_success
}
