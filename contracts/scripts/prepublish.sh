#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Remove the mock contracts from the typechain types
sed -n -i '' '/test/!p' $SCRIPT_DIR/../typechain-types/index.ts 
sed -n -i '' '/test/!p' $SCRIPT_DIR/../typechain-types/factories/index.ts
rm -rf \
  $SCRIPT_DIR/../typechain-types/test/ \
  $SCRIPT_DIR/../typechain-types/factories/test/

yarn tsc -p $SCRIPT_DIR/../tsconfig.publish.json