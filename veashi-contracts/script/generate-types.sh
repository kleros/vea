#!/bin/bash

# Configuration
ARTIFACTS_DIR="./veashi-contracts/out" 
SOURCE_CONTRACTS_DIR="./veashi-contracts/lib/hashi/packages/evm/contracts/" 
TARGET_SRC_DIR="./contracts/src"
SDK_ABI_DIR="./veashi-sdk/abi"
TYPECHAIN_DIR="./typechain-types"

# Clean and Prepare
rm -rf "$SDK_ABI_DIR" "$TYPECHAIN_DIR" "$TARGET_SRC_DIR"
mkdir -p "$SDK_ABI_DIR" "$TARGET_SRC_DIR"

echo "🔍 Searching for contracts and ABIs recursively..."

node -e "
const fs = require('fs');
const path = require('path');

const CONTRACTS_TO_FIND = [
  'VeaReporter.sol', 'VeaAdapter.sol',
  'LayerZeroAdapter.sol', 'LayerZeroReporter.sol',
  'CCIPAdapter.sol', 'CCIPReporter.sol',
  'Yaho.sol', 'Yaru.sol', 'Hashi.sol'
];

const ABIS_TO_FIND = CONTRACTS_TO_FIND.map(f => f.replace('.sol', '.json'));

/**
 * Recursively walks a directory and executes a callback for every file found
 */
function walk(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walk(filepath, callback);
        } else {
            callback(filepath, file);
        }
    });
}

// 1. Copy Source Files (Flattened)
walk('$SOURCE_CONTRACTS_DIR', (filePath, fileName) => {
    if (CONTRACTS_TO_FIND.includes(fileName)) {
        fs.copyFileSync(filePath, path.join('$TARGET_SRC_DIR', fileName));
        console.log('📄 Found & Copied: ' + fileName);
    }
});

// 2. Extract ABIs (Flattened)
walk('$ARTIFACTS_DIR', (filePath, fileName) => {
    if (ABIS_TO_FIND.includes(fileName)) {
        try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (content.abi) {
                fs.writeFileSync(
                    path.join('$SDK_ABI_DIR', fileName),
                    JSON.stringify(content.abi, null, 2)
                );
                console.log('✅ Extracted ABI: ' + fileName);
            }
        } catch (e) {
            console.error('❌ Failed to parse: ' + fileName);
        }
    }
});
"

# 3. Generate TypeChain
echo "🚀 Generating TypeChain types..."
npx typechain --target ethers-v6 "$SDK_ABI_DIR/*.json" --out-dir "$TYPECHAIN_DIR"

echo "✨ All set! Your package is ready for publishing."