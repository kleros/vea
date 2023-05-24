#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

find $SCRIPT_DIR/../src/ -type f -name '*.sol' | xargs sed -i.bak -e '/^ *\/\*\*$/d' -e '/ \*\//d' -e 's|  \* | /// |' -e 's|^ \* |///|'
