#!/bin/bash

# --- Configuration ---
HASHI_SRC="../veashi-contracts/lib/hashi/packages/evm/contracts"
VEASHI_SRC="../veashi-contracts/src/adapters"
ARTIFACTS_DIR="../veashi-contracts/out"

TARGET_DIR="./contracts"
SDK_ABI_DIR="./abi"
TYPECHAIN_DIR="./typechain-types"

BROADCAST_SRC="../veashi-contracts/broadcast"
SDK_ADD_DIR="./addresses"
REGISTRY_FILE="./registry.ts"

# --- Setup ---
rm -rf "$TARGET_DIR" "$SDK_ABI_DIR" "$TYPECHAIN_DIR" "$SDK_ADD_DIR"
mkdir -p "$TARGET_DIR" "$SDK_ABI_DIR" "$TYPECHAIN_DIR" "$SDK_ADD_DIR"

echo "🎯 Executing targeted copy and dependency crawl..."

node -e "
const fs = require('fs');
const path = require('path');

const collectedFiles = new Set();

/**
 * CORE LOGIC: 
 * We define exactly what we want and where it goes.
 */
const COPY_PLAN = [
    // HASHI CORE -> Target Root
    { srcBase: '$HASHI_SRC', file: 'Hashi.sol', destSubDir: '' },
    { srcBase: '$HASHI_SRC', file: 'Yaho.sol', destSubDir: '' },
    { srcBase: '$HASHI_SRC', file: 'Yaru.sol', destSubDir: '' },

    // HASHI ADAPTERS -> adapters/layerZero/
    { srcBase: '$HASHI_SRC', file: 'adapters/layerZero/LayerZeroAdapter.sol', destSubDir: 'adapters/layerZero' },
    { srcBase: '$HASHI_SRC', file: 'adapters/layerZero/LayerZeroReporter.sol', destSubDir: 'adapters/layerZero' },

    // VEASHI SRC -> adapters/ (Vea, DeBridge and Chainlink)
    { srcBase: '$VEASHI_SRC', file: 'vea', destSubDir: 'adapters/vea' },
    { srcBase: '$VEASHI_SRC', file: 'chainlink', destSubDir: 'adapters/chainlink' },
    { srcBase: '$VEASHI_SRC', file: 'deBridge', destSubDir: 'adapters/deBridge' }
];

/**
 * Dependency Crawler
 * Ensures that if a contract is moved, its internal imports (interfaces/utils) follow it.
 */
function processPath(baseDir, relativePath, targetSubDir) {
    const fullPath = path.resolve(baseDir, relativePath);
    if (!fs.existsSync(fullPath) || collectedFiles.has(fullPath)) return;

    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
        fs.readdirSync(fullPath).forEach(file => {
            processPath(baseDir, path.join(relativePath, file), targetSubDir);
        });
        return;
    }

    // Only process .sol files
    if (!relativePath.endsWith('.sol')) return;

    collectedFiles.add(fullPath);
    
    // Construct the destination: TARGET_DIR + specific subDir + the filename
    const fileName = path.basename(fullPath);
    const finalDest = path.join('$TARGET_DIR', targetSubDir, fileName);

    fs.mkdirSync(path.dirname(finalDest), { recursive: true });
    fs.copyFileSync(fullPath, finalDest);
    console.log('✅ Copied: ' + fileName + ' -> ' + targetSubDir);

    // Crawl Imports
    const content = fs.readFileSync(fullPath, 'utf8');
    const importRegex = /import\s+(?:\{.*\}\s+from\s+)?['\"](.*\.sol)['\"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Resolve relative to the current file's directory within its original source
        const resolvedImport = path.join(path.dirname(relativePath), importPath);
        
        // Dependencies maintain their internal relative structure (e.g. ./interfaces/...)
        // unless they are part of the core files we already moved.
        const depTargetSubDir = path.join(targetSubDir, path.dirname(importPath));
        processPath(baseDir, resolvedImport, depTargetSubDir);
    }
}

// Execute the plan
COPY_PLAN.forEach(plan => {
    console.log('--- Processing: ' + plan.file + ' ---');
    processPath(plan.srcBase, plan.file, plan.destSubDir);
});
"

# --- ABI Extraction (Stays the same) ---
echo "📑 Extracting ABIs..."
node -e "
const fs = require('fs');
const path = require('path');
const ALLOW = [
  'Hashi.json', 'Yaho.json', 'Yaru.json', 
  'LayerZeroAdapter.json', 'LayerZeroReporter.json',
  'VeaAdapter.json', 'VeaReporter.json',
  'CCIPAdapter.json', 'CCIPReporter.json','Reporter.json',
  'Adapter.json', 'DeBridgeReporter.json', 'DeBridgeAdapter.json'
];
function walk(dir) {
    if(!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (ALLOW.includes(f)) {
            const c = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (c.abi) fs.writeFileSync(path.join('$SDK_ABI_DIR', f), JSON.stringify(c.abi, null, 2));
        }
    });
}
walk('$ARTIFACTS_DIR');
"

# Run TypeChain ONLY on the filtered ABIs
echo "🚀 Generating targeted TypeChain types..."
npx typechain --target ethers-v6 "$SDK_ABI_DIR/*.json" --out-dir "$TYPECHAIN_DIR"

# Syncing Addresses with SDK
echo "🔗 Syncing chain-specific broadcast files to SDK..."

node -e "
const fs = require('fs');
const path = require('path');

const broadcastDir = '$BROADCAST_SRC';
const destDir = '$SDK_ADD_DIR';

// Regex to match files like 1-137.json or 42161-10.json
const chainPairRegex = /^\d+-\d+\.json$/;

function syncChainFiles(dir) {
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            syncChainFiles(fullPath);
        } else if (chainPairRegex.test(file)) {
            const destFile = path.join(destDir, file);
            fs.copyFileSync(fullPath, destFile);
            console.log('✅ Synced: ' + file + ' -> ' + destDir);
        }
    });
}

syncChainFiles(broadcastDir);
"

# Regenerating the SDK route registry from the synced address files
echo "📝 Regenerating registry.ts from synced addresses..."

node -e "
const fs = require('fs');

const addrDir = '$SDK_ADD_DIR';
const registryFile = '$REGISTRY_FILE';
const chainPairRegex = /^\d+-\d+\.json$/;

const routes = fs.readdirSync(addrDir).filter(f => chainPairRegex.test(f)).sort();

const lines = [];
lines.push('import type { FlatRouteFile } from ' + JSON.stringify('./types') + ';');
lines.push('');
routes.forEach((f, i) => {
    lines.push('import route_' + i + ' from ' + JSON.stringify('./addresses/' + f) + ';');
});
lines.push('');
lines.push('export const ROUTES: Record<string, FlatRouteFile> = {');
routes.forEach((f, i) => {
    lines.push('  ' + JSON.stringify(f.replace(/\.json$/, '')) + ': route_' + i + ',');
});
lines.push('};');
lines.push('');

fs.writeFileSync(registryFile, lines.join('\n'));
console.log('✅ Registry updated with ' + routes.length + ' route(s)');
"

echo "✨ Done! Your target directory is now structured correctly."