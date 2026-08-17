#!/usr/bin/env node
/**
 * Install repo-owned git hooks into .git/hooks without changing git config.
 * Skips when .git is absent (tarball / CI-less npm installs).
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HOOKS_SRC = join(ROOT, 'scripts', 'git-hooks');

function resolveGitDir(root) {
  const gitPath = join(root, '.git');
  if (!existsSync(gitPath)) {
    return null;
  }
  const info = statSync(gitPath);
  if (info.isDirectory()) {
    return gitPath;
  }
  const text = readFileSync(gitPath, 'utf8').trim();
  const match = text.match(/^gitdir:\s*(.+)$/m);
  if (!match) {
    return null;
  }
  const gitDir = match[1].trim();
  return isAbsolute(gitDir) ? gitDir : resolve(dirname(gitPath), gitDir);
}

function main() {
  if (!existsSync(HOOKS_SRC)) {
    return;
  }

  const gitDir = resolveGitDir(ROOT);
  if (!gitDir) {
    return;
  }

  const destDir = join(gitDir, 'hooks');
  mkdirSync(destDir, { recursive: true });

  for (const name of readdirSync(HOOKS_SRC)) {
    if (name.startsWith('.') || name.endsWith('.sample')) {
      continue;
    }
    const src = join(HOOKS_SRC, name);
    if (!statSync(src).isFile()) {
      continue;
    }
    const dest = join(destDir, name);
    copyFileSync(src, dest);
    chmodSync(dest, 0o755);
  }
}

main();
