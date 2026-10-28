#!/bin/bash

# Tests the download proxy config locally: starts nginx with nginx.conf in a
# docker container on port 8099, checks downloads, redirects, encoded paths,
# npm, gem and pip registry requests, the cache and the host allowlist, then
# prints the stats.
# Usage: .github/actions/download-proxy/test.sh (needs docker and curl)

set -e

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# nginx takes over the cache folder, so it lives in a folder of ours to be
# removable
tmp="$(mktemp -d)"
logs="${tmp}/logs"
cache="${tmp}/cache"
name=containerbase-cdn-test
proxy=http://127.0.0.1:8099
failed=0

# makes the cache files of the nginx workers readable and removable here
open_cache() {
  docker exec "${name}" chmod -R a+rwX /var/cache/containerbase-cdn > /dev/null 2>&1 || true
}

# removes the container, the log and the cache folder
# shellcheck disable=SC2329 # called by the EXIT trap
cleanup() {
  open_cache
  docker rm -f "${name}" > /dev/null 2>&1 || true
  rm -rf "${tmp}"
}
trap cleanup EXIT

# the nginx image runs as root, so the folders must be writable for it
mkdir "${logs}" "${cache}"
chmod 777 "${logs}" "${cache}"

docker run -d --name "${name}" --network host \
  -v "${cache}:/var/cache/containerbase-cdn" \
  -v "${logs}:/var/log/containerbase-cdn" \
  -v "${dir}:/etc/containerbase-cdn:ro" \
  nginx:stable nginx -c /etc/containerbase-cdn/nginx.conf -g "daemon off;" > /dev/null

# waits until the proxy answers
for _ in $(seq 1 30); do
  curl -s -o /dev/null "${proxy}/" && break
  sleep 1
done

# requests a path through the proxy and compares status and cache status
# usage: check <path> <expected status> [expected cache status] [accept header]
check() {
  local path="$1" status="$2" cache="${3:-}" accept="${4:-}"
  local result
  local args=(-s -o /dev/null -w '%{http_code} %header{x-cache-status}')
  if [ -n "${accept}" ]; then
    args+=(-H "Accept: ${accept}")
  fi
  result="$(curl "${args[@]}" "${proxy}/${path}")"
  local got_status="${result%% *}" got_cache="${result#* }"
  if [ "${got_status}" = "${status}" ] && { [ -z "${cache}" ] || [ "${got_cache}" = "${cache}" ]; }; then
    echo "ok   ${got_status} ${got_cache} ${path}"
  else
    echo "FAIL ${got_status} ${got_cache} ${path} (expected ${status} ${cache})"
    failed=1
  fi
}

# requests a pypi index page through the proxy and checks that its file links
# point at the proxy, then downloads the first linked file through the proxy
# usage: check_pypi <path> [accept header]
check_pypi() {
  local path="$1" accept="${2:-}"
  local body file
  local args=(-s)
  if [ -n "${accept}" ]; then
    args+=(-H "Accept: ${accept}")
  fi
  body="$(curl "${args[@]}" "${proxy}/${path}")"
  file="$(grep -o "${proxy}/files\.pythonhosted\.org/[^\"#]*" <<< "${body}" | head -n 1 || true)"
  if [ -n "${file}" ] && ! grep -q 'https://files\.pythonhosted\.org/' <<< "${body}"; then
    echo "ok   links ${path} ${accept}"
    check "${file#"${proxy}/"}" 200
  else
    echo "FAIL links ${path} ${accept} (expected links to ${proxy}/files.pythonhosted.org/)"
    failed=1
  fi
}

# GitHub release asset, redirects to release-assets.githubusercontent.com
check github.com/nubjs/nub/releases/download/v0.9.3/nub-linux-x64.tar.gz.sha256 200 MISS
check github.com/nubjs/nub/releases/download/v0.9.3/nub-linux-x64.tar.gz.sha256 200 HIT
# two redirects
check github.com/containerbase/maven-prebuild/releases/latest/download/version 200
# encoded `%2F` in the release tag
check 'github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.8.3/checksums.txt' 200
# a slash in the release tag
check github.com/kubernetes-sigs/kustomize/releases/download/kustomize/v5.8.3/checksums.txt 200
# redirects to cdn.dl.k8s.io
check dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubectl.sha256 200
# lookup with a query string
check 'api.adoptium.net/v3/info/release_versions?architecture=x64&image_type=jdk&os=linux&page_size=1&release_type=ga&version=%5B21%2C22%29' 200
# npm packument, the abbreviated one for installs is a separate cache entry
check registry.npmjs.org/is-number 200 MISS
check registry.npmjs.org/is-number 200 HIT
check registry.npmjs.org/is-number 200 MISS 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
check registry.npmjs.org/is-number 200 HIT 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
# npm tarballs, npm drops the registry path prefix
check is-number/-/is-number-7.0.0.tgz 200 MISS
check is-number/-/is-number-7.0.0.tgz 200 HIT
check 'is-number/-/is-number-7.0.0.tgz?foo=bar' 200
check @types/node/-/node-24.0.0.tgz 200
# rubygems compact index and gem file
check rubygems.org/info/rake 200
check rubygems.org/gems/rake-13.0.0.gem 200
# pypi index, the json pip asks for and html, with the file links rewritten,
# also when served from the cache
check pypi.org/simple/six/ 200 MISS 'application/vnd.pypi.simple.v1+json, application/vnd.pypi.simple.v1+html; q=0.1, text/html; q=0.01'
check_pypi pypi.org/simple/six/ 'application/vnd.pypi.simple.v1+json, application/vnd.pypi.simple.v1+html; q=0.1, text/html; q=0.01'
check_pypi pypi.org/simple/six/
# missing file is passed through
check github.com/nubjs/nub/releases/download/v0.0.0-missing/nub-linux-x64.tar.gz 404
# host not in allowed-hosts.map
check example.com/ 403

echo ""
open_cache
"${dir}/stats.sh" "${logs}/access.log" "${cache}"

exit "${failed}"
