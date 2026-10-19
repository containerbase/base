# shellcheck disable=SC2034,SC2148,SC2155,SC2329

setup() {
  load "$BATS_SUPPORT_LOAD_PATH"
  load "$BATS_ASSERT_LOAD_PATH"

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -d)

  load "$TEST_DIR/../../src/usr/local/containerbase/utils/tmp-dir.sh"

  export CONTAINERBASE_DEFAULT_TMP_DIR="${TEST_ROOT_DIR}/tmp/containerbase"
  export CONTAINERBASE_TMP_DIR="${TEST_ROOT_DIR}/var/cache/containerbase"
  mkdir -p "${TEST_ROOT_DIR}/tmp"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "containerbase_tmp_dir uses the default for an empty value" {
  CONTAINERBASE_DEFAULT_TMP_DIR=/tmp/containerbase run containerbase_tmp_dir ""
  assert_success
  assert_output "/tmp/containerbase"
}

@test "containerbase_tmp_dir drops trailing slashes" {
  CONTAINERBASE_DEFAULT_TMP_DIR=/tmp/containerbase run containerbase_tmp_dir /var/cache/containerbase//
  assert_success
  assert_output "/var/cache/containerbase"

  CONTAINERBASE_DEFAULT_TMP_DIR=/tmp/containerbase run containerbase_tmp_dir /tmp/containerbase/
  assert_success
  assert_output "/tmp/containerbase"
}

@test "containerbase_tmp_dir ignores invalid values" {
  local value
  for value in relative/tmp / // /var//cache /var/./cache /var/../cache /var/cache/. /var/cache/.. /tmp /tmp/ /tmp/other /tmp/containerbase/persist; do
    CONTAINERBASE_DEFAULT_TMP_DIR=/tmp/containerbase run containerbase_tmp_dir "${value}"
    assert_failure
    assert_line "Ignoring invalid CONTAINERBASE_TMP_DIR=${value}, using /tmp/containerbase"
    assert_line "/tmp/containerbase"
  done
}

@test "containerbase_tmp_dir skips the warning when already warned" {
  CONTAINERBASE_TMP_DIR_WARNED=1 CONTAINERBASE_DEFAULT_TMP_DIR=/tmp/containerbase run containerbase_tmp_dir relative/tmp
  assert_failure
  assert_output "/tmp/containerbase"
}

@test "link_containerbase_tmp_path does nothing for the default dir" {
  run link_containerbase_tmp_path "${CONTAINERBASE_DEFAULT_TMP_DIR}"
  assert_success
  assert [ ! -e "${CONTAINERBASE_DEFAULT_TMP_DIR}" ]
}

@test "link_containerbase_tmp_path creates the link" {
  run link_containerbase_tmp_path
  assert_success
  assert [ "$(readlink "${CONTAINERBASE_DEFAULT_TMP_DIR}")" = "${CONTAINERBASE_TMP_DIR}" ]
}

@test "link_containerbase_tmp_path keeps a correct link" {
  ln -s "${CONTAINERBASE_TMP_DIR}" "${CONTAINERBASE_DEFAULT_TMP_DIR}"

  run link_containerbase_tmp_path
  assert_success
  assert [ "$(readlink "${CONTAINERBASE_DEFAULT_TMP_DIR}")" = "${CONTAINERBASE_TMP_DIR}" ]
}

@test "link_containerbase_tmp_path replaces a stale link" {
  mkdir -p "${TEST_ROOT_DIR}/other"
  ln -s "${TEST_ROOT_DIR}/other" "${CONTAINERBASE_DEFAULT_TMP_DIR}"

  run link_containerbase_tmp_path
  assert_success
  assert [ "$(readlink "${CONTAINERBASE_DEFAULT_TMP_DIR}")" = "${CONTAINERBASE_TMP_DIR}" ]
}

@test "link_containerbase_tmp_path warns when a stale link can't be replaced" {
  if [[ "${EUID}" -eq 0 ]]; then
    skip "root can always replace the link"
  fi
  mkdir -p "${TEST_ROOT_DIR}/other"
  ln -s "${TEST_ROOT_DIR}/other" "${CONTAINERBASE_DEFAULT_TMP_DIR}"
  chmod 555 "${TEST_ROOT_DIR}/tmp"

  run link_containerbase_tmp_path
  chmod 755 "${TEST_ROOT_DIR}/tmp"
  assert_failure
  assert_output "cannot switch ${CONTAINERBASE_DEFAULT_TMP_DIR} to ${CONTAINERBASE_TMP_DIR}, keeping the default folder; switch it at image build time as root"
  assert [ "$(readlink "${CONTAINERBASE_DEFAULT_TMP_DIR}")" = "${TEST_ROOT_DIR}/other" ]
}

@test "link_containerbase_tmp_path keeps a default folder as non-root without moving it" {
  is_containerbase_tmp_dir_root () { return 1; }
  mkdir -p "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d"

  run link_containerbase_tmp_path
  assert_failure 1
  assert_output "cannot switch ${CONTAINERBASE_DEFAULT_TMP_DIR} to ${CONTAINERBASE_TMP_DIR}, keeping the default folder; switch it at image build time as root"
  assert [ -d "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d" ]
  assert [ ! -e "${CONTAINERBASE_TMP_DIR}" ]
}

@test "link_containerbase_tmp_path moves a default folder as root" {
  is_containerbase_tmp_dir_root () { return 0; }
  mkdir -p "${CONTAINERBASE_DEFAULT_TMP_DIR}/cache/.npm" "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d" "${CONTAINERBASE_TMP_DIR}/cache"
  touch "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d/node"
  echo old > "${CONTAINERBASE_DEFAULT_TMP_DIR}/cache/.npmrc"
  echo keep > "${CONTAINERBASE_TMP_DIR}/cache/.npmrc"

  run link_containerbase_tmp_path
  assert_success
  assert [ "$(readlink "${CONTAINERBASE_DEFAULT_TMP_DIR}")" = "${CONTAINERBASE_TMP_DIR}" ]
  assert [ -f "${CONTAINERBASE_TMP_DIR}/tool.init.d/node" ]
  assert [ -d "${CONTAINERBASE_TMP_DIR}/cache/.npm" ]
  assert [ "$(cat "${CONTAINERBASE_TMP_DIR}/cache/.npmrc")" = keep ]
}

@test "link_containerbase_tmp_path creates the configured folder with mode 775" {
  is_containerbase_tmp_dir_root () { return 0; }
  mkdir -p "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d"

  run link_containerbase_tmp_path
  assert_success
  assert [ "$(stat --format '%a' "${CONTAINERBASE_TMP_DIR}")" -eq 775 ]
  assert [ -d "${CONTAINERBASE_TMP_DIR}/tool.init.d" ]
}

@test "link_containerbase_tmp_path keeps the default folder when the move fails" {
  if [[ "${EUID}" -eq 0 ]]; then
    skip "root can always move the entries"
  fi
  is_containerbase_tmp_dir_root () { return 0; }
  mkdir -p "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d" "${CONTAINERBASE_TMP_DIR}"
  chmod 555 "${CONTAINERBASE_TMP_DIR}"

  run link_containerbase_tmp_path
  chmod 755 "${CONTAINERBASE_TMP_DIR}"
  assert_failure
  assert_line "cannot switch ${CONTAINERBASE_DEFAULT_TMP_DIR} to ${CONTAINERBASE_TMP_DIR}, keeping the default folder; switch it at image build time as root"
  assert [ -d "${CONTAINERBASE_DEFAULT_TMP_DIR}/tool.init.d" ]
  assert [ ! -L "${CONTAINERBASE_DEFAULT_TMP_DIR}" ]
}

@test "link_containerbase_tmp_path fails for a default file" {
  touch "${CONTAINERBASE_DEFAULT_TMP_DIR}"

  run link_containerbase_tmp_path
  assert_failure 2
  assert_output "${CONTAINERBASE_DEFAULT_TMP_DIR} is a file, remove it"
  assert [ -f "${CONTAINERBASE_DEFAULT_TMP_DIR}" ]
}
