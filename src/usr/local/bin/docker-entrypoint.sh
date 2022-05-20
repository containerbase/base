#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${BUILDPACK+x}" ]]; then
    # shellcheck source=/dev/null
  . /usr/local/etc/env
fi

exec dumb-init -- "$@"
