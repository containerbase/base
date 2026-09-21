#!/bin/bash

# Runs the given command with the `GITHUB_TOKEN` build secret configured as a
# nix access token, so github.com flake inputs aren't rate limited. Does
# nothing when the secret isn't mounted.
#
#   RUN --mount=type=secret,id=GITHUB_TOKEN,uid=12021 \
#     ./with-github-token.sh nix flake update

set -ex

secret=/run/secrets/GITHUB_TOKEN

if [ -f "${secret}" ]; then
  # xtrace off, so the token isn't printed to the build log
  set +x
  NIX_CONFIG="access-tokens = github.com=$(cat "${secret}")"
  set -x
  export NIX_CONFIG
fi

exec "$@"
