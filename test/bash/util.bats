
setup() {
  load 'test_helper/bats-support/load'
  load 'test_helper/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"

  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "check works as expected" {
  FOO=1
  run check FOO
  assert_success

  run check foobar
  assert_failure

  foobar=""
  run check foobar
  assert_success
}

@test "is root works as expected" {
  TEST_ROOT_USER=0
  run is_root
  assert_output "0"

  TEST_ROOT_USER=1000
  run is_root
  assert_output "1"
}

@test "can require a tool" {
  run require_tool
  assert_output --partial "No tool defined"
  assert_failure

  run require_tool foo
  assert_output --partial "No version defined"
  assert_failure

  require_tool foo 1.2.3
  assert [ "${TOOL_NAME}" = "foo" ]
  assert [ "${TOOL_VERSION}" = "1.2.3" ]
  assert [ "${FOO_VERSION}" = "1.2.3" ]

  FOO_VERSION=1.2.4 require_tool foo
  assert [ "${TOOL_NAME}" = "foo" ]
  assert [ "${TOOL_VERSION}" = "1.2.4" ]

  FOO_BAR_VERSION=1.2.5 require_tool foo-bar
  assert [ "${TOOL_NAME}" = "foo-bar" ]
  assert [ "${TOOL_VERSION}" = "1.2.5" ]
}

@test "requires the user" {
  run require_user
  assert_output --partial "No USER_NAME defined"
  assert_failure

  USER_NAME=foo run require_user
  assert_success
}

@test "requires root" {
  run require_root

  if [[ $EUID -ne 0 ]]; then
    assert_output --partial "run as root"
    assert_failure
  else
    assert_success
  fi


  USER_NAME=foo run require_user
  assert_success
}

@test "checks the semver" {

  run check_semver
  assert_failure

  run check_semver foo.bar.baz
  assert_failure

  check_semver 1.2.3
  assert [ "${MAJOR}" = "1" ]
  assert [ "${MINOR}" = "2" ]
  assert [ "${PATCH}" = "3" ]

  check_semver 1.2.4-baz
  assert [ "${MAJOR}" = "1" ]
  assert [ "${MINOR}" = "2" ]
  assert [ "${PATCH}" = "4" ]
}
