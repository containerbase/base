#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${CONTAINERBASE_ENV+x}" ]]; then
    # shellcheck source=/dev/null
  . /usr/local/etc/env
fi

if [[ ! -d "/tmp/containerbase" ]]; then
  # initialize all prepared tools
  containerbase-cli init tool all
fi

exec dumb-init -- "$@"
