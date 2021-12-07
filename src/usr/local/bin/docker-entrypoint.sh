#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${BUILDPACK+x}" ]]; then
  . /usr/local/etc/env
fi

exec dumb-init -- "$@"
