
setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"

  # Not used yet, but will be later
  TEST_ROOT_DIR=$(mktemp -u)

  # set directories for test
  ROOT_DIR="${TEST_ROOT_DIR}/root"
  BIN_DIR="${TEST_ROOT_DIR}/bin"
  USER_HOME="${TEST_ROOT_DIR}/user"
  ENV_FILE="${TEST_ROOT_DIR}/env"

  load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "require_tool" {
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

@test "requires_user" {
  run require_user
  assert_output --partial "No USER_NAME defined"
  assert_failure

  USER_NAME= run require_user
  assert_output --partial "No USER_NAME defined"
  assert_failure

  USER_NAME=foo run require_user
  assert_success
}

@test "requires_root" {
  run require_root

  # Bogus test right now, but will be improved
  # when we refactor the utils functions
  if [[ $EUID -ne 0 ]]; then
    assert_output --partial "run as root"
    assert_failure
  else
    assert_success
  fi

  USER_NAME=foo run require_user
  assert_success
}

@test "check_semver" {

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

  check_semver 11.0.14+9
  assert [ "${MAJOR}" = "11" ]
  assert [ "${MINOR}" = "0" ]
  assert [ "${PATCH}" = "14" ]

  run check_semver 1.2.3
  assert_success

  run check_semver 1.2.3 "none"
  assert_success

  run check_semver 1.2.3 "all"
  assert_success

  run check_semver 1.2.3 "major"
  assert_success

  run check_semver 1.2.3 "minor"
  assert_success

  run check_semver 1.2.3 "patch"
  assert_success

  run check_semver 1.2 "none"
  assert_success

  run check_semver 1.2 "all"
  assert_failure

  run check_semver 1.2 "major"
  assert_success

  run check_semver 1.2 "minor"
  assert_success

  run check_semver 1.2 "patch"
  assert_failure

  run check_semver 1 "all"
  assert_failure

  run check_semver 1 "none"
  assert_success

  run check_semver 1 "major"
  assert_success

  run check_semver 1 "minor"
  assert_failure

  run check_semver 1 "patch"
  assert_failure
}

@test "deprecated check_version function" {
  run check_version FOO
  assert_output --partial "deprecated"
  assert_failure

  FOO=1.2.3 check_version FOO
  assert [ "${FOO}" = "1.2.3" ]

  unset FOO

  FOO=v1.2.3 check_version FOO
  assert [ "${FOO}" = "1.2.3" ]
}

@test "check_command" {
  run check_command foo
  assert_failure
  assert_output --partial "No foo defined"

  run check_command
  assert_failure
  assert_output --partial "No  defined"

  run check_command ls
  assert_success
}

@test "require_distro" {
  if ! check_command "lsb_release" || [ ! $(lsb_release -si) =~ "Ubuntu" ]; then
    skip "not ubuntu"
  fi

  # Not testable that easily, needs to be refactored first
}

@test "get_distro" {
  if ! check_command "lsb_release" || [ ! $(lsb_release -si) =~ "Ubuntu" ]; then
    skip "not ubuntu"
  fi

  # Not testable that easily, needs to be refactored first
}

@test "ignore_tool" {

  # This is fine as the tool is normally checked before
  TOOL_NAME= \
  IGNORED_TOOLS= \
  run ignore_tool
  assert_output "1"

  TOOL_NAME=foo \
  IGNORED_TOOLS= \
  run ignore_tool
  assert_output "0"

  TOOL_NAME=foo \
  IGNORED_TOOLS=foo,bar \
  run ignore_tool
  assert_output "1"

  TOOL_NAME=bar \
  IGNORED_TOOLS=foo,bar \
  run ignore_tool
  assert_output "1"
}

@test "check" {
  foo=1
  run check "foo"
  assert_success

  run check "bar"
  assert_failure
  assert_output --partial "not set"

  bar=
  run check "bar"
  assert_success

  run check "bar" true
  assert_failure
  assert_output --partial "empty"

  run check ""
  assert_failure

  run check
  assert_failure
}
