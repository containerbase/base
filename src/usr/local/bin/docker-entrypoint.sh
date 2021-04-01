#!/bin/bash

if [[ -f "$BASH_ENV" && -z "${BUILDPACK+x}" ]]; then
  . $BASH_ENV
fi

exec dumb-init -- "$@"
