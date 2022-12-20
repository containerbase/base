setup_file () {
  export TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"

  # set up the cache
  load "$TEST_DIR/../cache.sh"
  export BUILDPACK_CACHE_DIR="$(create_temp_dir TEST_CACHE_DIR)"
}

setup() {
  load '../../../node_modules/bats-support/load'
  load '../../../node_modules/bats-assert/load'

  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../../src/usr/local/buildpack/util.sh"

  # load v2 overwrites
  load "$TEST_DIR/../../../src/usr/local/buildpack/utils/v2/overrides.sh"

  # load test overwrites
  load "$TEST_DIR/../util.sh"

  setup_directories

  # set default test user
  TEST_ROOT_USER=1000

  # load python
  load "$TEST_DIR/../../../src/usr/local/buildpack/tools/v2/python.sh"

}

teardown() {
    rm -rf "${TEST_ROOT_DIR}"
}

teardown_file () {
  clean_temp_dir $BUILDPACK_CACHE_DIR TEST_CACHE_DIR
}

@test "python: check_tool_requirements" {
  TOOL_NAME=python

  TOOL_VERSION=foobar \
  run check_tool_requirements
  assert_failure

  TOOL_VERSION=1.2.3 \
  run check_tool_requirements
  assert_success
}

@test "python: check_tool_installed" {
  local TOOL_NAME=python
  local TOOL_VERSION

  # renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
  TOOL_VERSION=3.11.1

  run check_tool_installed
  assert_failure

  # needed to export versions
  check_tool_requirements

  run prepare_tool
  assert_success

  run install_tool
  assert_success

  run check_tool_installed
  assert_success
}

@test "python: install_tool" {
  local TOOL_NAME=python
  local TOOL_VERSION

  # renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
  TOOL_VERSION=3.11.1

  # needed to export versions
  check_tool_requirements

  run prepare_tool
  assert_success

  run install_tool
  assert_success

  local versioned_tool_path=$(find_versioned_tool_path)

  PATH="${versioned_tool_path}/bin" \
  run python --version
  assert_success
  assert_output --partial "${TOOL_VERSION}"

  # don't update
  TOOL_VERSION=3.10.4

  # needed to export versions
  check_tool_requirements

  run install_tool
  assert_success

  local versioned_tool_path=$(find_versioned_tool_path)

  PATH="${versioned_tool_path}/bin" \
  run python --version
  assert_success
  assert_output --partial "${TOOL_VERSION}"
}

@test "python: link_tool" {
  local TOOL_NAME=python
  local TOOL_VERSION
  local bin_path=$(get_bin_path)

  # renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
  TOOL_VERSION=3.11.1

  # needed to export versions
  check_tool_requirements

  run prepare_tool
  assert_success

  run install_tool
  assert_success

  PATH="${bin_path}:$PATH" \
  run link_tool
  assert_success
  assert_output --partial "${TOOL_VERSION}"

  PATH="${bin_path}" \
  run python --version
  assert_success
  assert_output --partial "${TOOL_VERSION}"

  local versioned_tool_path=$(find_versioned_tool_path)

  PATH="${versioned_tool_path}/bin" \
  run python --version
  assert_success
  assert_output --partial "${TOOL_VERSION}"

  # don't update
  TOOL_VERSION=3.10.4

  # needed to export versions
  check_tool_requirements

  run install_tool
  assert_success

  PATH="${bin_path}:$PATH" \
  run link_tool
  assert_success
  assert_output --partial "${TOOL_VERSION}"

  local versioned_tool_path=$(find_versioned_tool_path)

  PATH="${versioned_tool_path}/bin" \
  run python --version
  assert_success
  assert_output --partial "${TOOL_VERSION}"

  PATH="${bin_path}" \
  run python --version
  assert_success
  assert_output --partial "${TOOL_VERSION}"
}
