
setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"
  TEST_ROOT_DIR=$(mktemp -u)

  # Not used yet, but will be later
  load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "require_tool" {
  run require_tool
  assert_output --partial "No tool defined"
  assert_failure

  # TODO(Chumper): In my opinion this test should fail
  run require_tool foo
  # assert_output --partial "No version defined"
  # assert_failure
  assert_success

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

  # TODO(Chumper): In my opinion this test should fail
  USER_NAME= run require_user
  # assert_output --partial "No USER_NAME defined"
  # assert_failure
  assert_success

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

  # TODO(Chumper): This command should fail in my opinion
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

  # TODO(Chumper): Should this succed?
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
