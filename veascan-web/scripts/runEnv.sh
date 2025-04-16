#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

commands="$*"

function sourceEnvFile() { #envFile
    envFile="$1"
    if [ -f "$envFile" ]; then
        echo -e "${GREEN}✔${NC} $(basename "$envFile")"
        # shellcheck source=SCRIPTDIR/../.env.devnet
        . "$envFile"
    else
        echo -e "${RED}✖${NC} $(basename "$envFile")"
    fi
}

envFile="$SCRIPT_DIR/../.env"
sourceEnvFile "$envFile"
sourceEnvFile "$envFile.public"

(set -e; $commands)
