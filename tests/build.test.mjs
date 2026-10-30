import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, ORDER, assertOrderComplete, sourceFiles } from '../scripts/build.mjs';

test('build order covers every source module', () => {
  assertOrderComplete();
  assert.equal(ORDER.length, sourceFiles().length);
  assert.equal(new Set(ORDER).size, ORDER.length, 'ORDER must not contain duplicates');
});

test('build produces a complete userscript', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inshelf-build-'));
  try {
    const outFile = join(dir, 'inshelf.user.js');
    const result = build({ outFile });
    const output = readFileSync(outFile, 'utf8');

    assert.ok(result.bytes > 1000);
    assert.equal(result.modules, ORDER.length);
    assert.match(output, /^\/\/ ==UserScript==/);
    assert.match(output, /@grant\s+GM_xmlhttpRequest/);
    assert.match(output, /@match\s+\*:\/\/javdb\.com\/\*/);
    assert.match(output, /@match\s+\*:\/\/123av\.com\/\*/);
    assert.match(output, /\/\* ===== src\/core\/codes\.js ===== \*\//);
    assert.match(output, /\/\* ===== src\/sites\/av123\.js ===== \*\//);
    assert.match(output, /Inshelf\.createApp/);
    assert.match(output, /Inshelf\.serverRegistry\.register/);
    assert.doesNotMatch(output, /^import\s/m);
    assert.doesNotMatch(output, /^export\s/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
