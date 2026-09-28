import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { KEYS } from "./spec.mjs";

/** Stable hash of the inputs and every file/config that shapes the output. Secrets and RPC URLs are never included. */
export function inputVersion(parts) {
  const canonical = JSON.stringify(parts, Object.keys(parts).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** Parse KEY=value lines (no interpolation, quotes stripped), enough for .env.example and a local .env. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split("\n")) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || raw.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * Render the output env from the template, keeping its comments and order.
 * `values` are KEY -> {value, source?}; keys of bridges that were not requested are blanked
 * so stale example values can never be deployed by accident; keys the template lacks are appended.
 */
export function renderEnv({ template, values, bridges, header }) {
  const groups = new Set(["core", ...bridges]);
  const seen = new Set();
  const out = [];
  for (const line of template.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const key = m[1];
    seen.add(key);
    if (values[key] !== undefined) {
      if (values[key].source) out.push(`# source: ${values[key].source}`);
      out.push(`${key}=${values[key].value}`);
    } else if (KEYS[key] && !groups.has(KEYS[key].group)) out.push(`${key}=`);
    else out.push(line);
  }
  const extra = Object.keys(values).filter((k) => !seen.has(k));
  if (extra.length) {
    out.push("", "# Keys required by the deploy scripts but missing from .env.example");
    for (const k of extra) {
      if (values[k].source) out.push(`# source: ${values[k].source}`);
      out.push(`${k}=${values[k].value}`);
    }
  }
  return `${header.map((h) => `# ${h}`).join("\n")}\n\n${out.join("\n").replace(/\n{3,}/g, "\n\n")}`;
}

/** Write via a sibling temp file and rename, so readers never see a partial file. */
export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
