#!/usr/bin/env node
/**
 * Print SHA-256 of package-lock.json and list exact wallet crypto pins.
 *
 * Web ships as a Next.js source/deploy (no browser zip artifacts).
 * Record this digest in release notes alongside the git tag.
 *
 * Usage: node scripts/hash-release-inputs.mjs
 *        npm run hash:release-inputs
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const CRYPTO_PINS = [
  '@scure/bip39',
  'bip32',
  'bitcoinjs-lib',
  'ecpair',
  '@bitcoinerlab/secp256k1',
  'hash-wasm',
];

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function main() {
  const lockPath = join(ROOT, 'package-lock.json');
  const pkgPath = join(ROOT, 'package.json');

  if (!existsSync(lockPath)) {
    console.error('package-lock.json missing — cannot hash release inputs.');
    process.exit(1);
  }
  if (!existsSync(pkgPath)) {
    console.error('package.json missing.');
    process.exit(1);
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    console.error(
      `Failed to read package.json: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }

  let digest;
  try {
    digest = sha256File(lockPath);
  } catch (err) {
    console.error(
      `Failed to hash package-lock.json: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }

  console.log(`package-lock.json  sha256:${digest}`);
  console.log('');
  console.log('Exact crypto pins (package.json dependencies):');
  const deps = pkg.dependencies ?? {};
  for (const name of CRYPTO_PINS) {
    const ver = deps[name];
    if (ver === undefined) {
      console.log(`  ${name}: MISSING`);
      continue;
    }
    const exact = !String(ver).startsWith('^') && !String(ver).startsWith('~');
    console.log(`  ${name}@${ver}${exact ? '' : '  (NOT exact — fix package.json)'}`);
  }

  const overrides = pkg.overrides ?? {};
  if (Object.keys(overrides).length > 0) {
    console.log('');
    console.log('overrides:');
    for (const [k, v] of Object.entries(overrides)) {
      console.log(`  ${k}@${v}`);
    }
  }
}

main();
