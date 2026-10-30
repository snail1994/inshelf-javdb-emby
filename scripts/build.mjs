/*
 * Zero-dependency userscript build.
 *
 * Why not a bundler? The project has no runtime dependencies, and contributors
 * only need Node. Source files attach to the Inshelf namespace; this script
 * concatenates them in dependency order and prepends the userscript header.
 * The output in dist/ is committed so end users never need Node.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = join(ROOT, 'dist/inshelf-javdb-emby.user.js');

/**
 * Dependency order. Add new adapters here; build() fails if a src/*.js file is
 * missing, which prevents the classic "forgot to include the new module" bug.
 */
export const ORDER = [
  'src/core/namespace.js',
  'src/core/codes.js',
  'src/core/matcher.js',
  'src/core/state.js',
  'src/servers/registry.js',
  'src/servers/http.js',
  'src/servers/emby.js',
  'src/sites/registry.js',
  'src/sites/javdb.js',
  'src/sites/av123.js',
  'src/storage.js',
  'src/ui/styles.js',
  'src/ui/toast.js',
  'src/ui/badges.js',
  'src/ui/settings.js',
  'src/app.js',
  'src/main.js'
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export function sourceFiles() {
  return walk(join(ROOT, 'src'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => relative(ROOT, file).replaceAll('\\', '/'))
    .sort();
}

export function assertOrderComplete() {
  const files = sourceFiles();
  const missing = files.filter((file) => !ORDER.includes(file));
  const stale = ORDER.filter((file) => !files.includes(file));
  if (missing.length || stale.length) {
    throw new Error(
      'build order is out of sync'
        + (missing.length ? '; missing: ' + missing.join(', ') : '')
        + (stale.length ? '; stale: ' + stale.join(', ') : '')
    );
  }
}

export function build({ outFile = OUT_FILE } = {}) {
  assertOrderComplete();

  const header = readFileSync(join(ROOT, 'src/userscript-header.txt'), 'utf8').trimEnd();
  const chunks = [header];

  for (const rel of ORDER) {
    const body = readFileSync(join(ROOT, rel), 'utf8').trimEnd();
    chunks.push(`\n/* ===== ${rel} ===== */\n${body}`);
  }

  const output = chunks.join('\n') + '\n';
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, output, 'utf8');

  return {
    outFile,
    bytes: Buffer.byteLength(output),
    modules: ORDER.length
  };
}

const isMain = Boolean(
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  const result = build();
  console.log(
    `built ${relative(ROOT, result.outFile)} (${result.bytes} bytes, ${result.modules} modules)`
  );
}
