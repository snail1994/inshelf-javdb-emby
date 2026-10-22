import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Load order mirrors the userscript build order.
require('../src/core/namespace.js');
const codes = require('../src/core/codes.js');
const matcher = require('../src/core/matcher.js');
const state = require('../src/core/state.js');

test('normalize handles separators, case and FC2', () => {
  assert.equal(codes.normalize('abc_123'), 'ABC-123');
  assert.equal(codes.normalize(' ABC 123 '), 'ABC-123');
  assert.equal(codes.normalize('ABC--123'), 'ABC-123');
  assert.equal(codes.normalize('fc2-ppv-1234567'), 'FC2-PPV-1234567');
  assert.equal(codes.normalize(''), '');
});

test('extractCodes recognizes common JAV code shapes', () => {
  assert.deepEqual(codes.extractCodes('ABC-123'), ['ABC-123']);
  assert.deepEqual(codes.extractCodes('abc_123'), ['ABC-123']);
  assert.deepEqual(codes.extractCodes('ABC123'), ['ABC-123']);
  assert.deepEqual(codes.extractCodes('T28-123'), ['T28-123']);
  assert.deepEqual(codes.extractCodes('MDWP0034'), ['MDWP-0034']);
  assert.deepEqual(codes.extractCodes('SSIS00123'), ['SSIS-00123']);
  assert.deepEqual(codes.extractCodes('[ThZu.Cc]ABC-123-C.mp4'), ['ABC-123']);
  assert.deepEqual(codes.extractCodes('FC2-PPV-1234567'), ['FC2-PPV-1234567']);
  assert.deepEqual(codes.extractCodes('FC2-1234567'), ['FC2-1234567']);
});

test('extractCodes rejects resolutions, dates and plain noise', () => {
  assert.deepEqual(codes.extractCodes('FHD-1080'), []);
  assert.deepEqual(codes.extractCodes('UHD-2160'), []);
  assert.deepEqual(codes.extractCodes('2024-10-23'), []);
  assert.deepEqual(codes.extractCodes('1080p x264 AAC'), []);
  assert.deepEqual(codes.extractCodes('中文标题没有任何番号'), []);
});

test('basename strips folders, query and media extension', () => {
  assert.equal(codes.basename('/media/ABC-123-C.mp4?token=1'), 'ABC-123-C');
  assert.equal(codes.basename('D:\\media\\ABC-123.mkv'), 'ABC-123');
  assert.equal(codes.basename('https://x/y/ABC-123.strm#x'), 'ABC-123');
});

test('variants include exact, no-leading-zero, suffix and compact forms', () => {
  const v = codes.variants('ABC-001');
  assert.ok(v.includes('ABC-001'));
  assert.ok(v.includes('ABC-1'));
  assert.ok(v.includes('ABC1'));
  assert.ok(v.includes('ABC001'));

  const suffix = codes.variants('ABC-123-C');
  assert.ok(suffix.includes('ABC-123'));

  const fc2 = codes.variants('FC2-PPV-1234567');
  assert.ok(fc2.includes('FC2-1234567'));
  assert.ok(fc2.includes('FC2PPV1234567'));
});

test('buildIndex merges versions and computes coverage', () => {
  const index = matcher.buildIndex([
    { id: '1', name: 'ABC-123', path: '/media/ABC-123-C.mp4' },
    { id: '2', name: 'ABC-123', path: '/media/ABC-123-UC.mkv' },
    { id: '3', name: '中文标题', path: '/media/未知文件.mp4' }
  ]);

  assert.equal(index.total, 3);
  assert.equal(index.coded, 2);
  assert.equal(index.coverage, 2 / 3);
  assert.equal(index.byCode['ABC-123'].count, 2);
  assert.equal(index.byCode['ABC-123'].id, '1');
});

test('lookup handles exact and compact keys', () => {
  const index = matcher.buildIndex([
    { id: '1', name: 'ABC-123', path: '/media/ABC-123.mp4' }
  ]);

  const exact = matcher.lookup(index, 'ABC-123');
  assert.equal(exact.item.id, '1');
  assert.equal(exact.matchType, 'exact');

  const compact = matcher.lookup(index, 'ABC123');
  assert.equal(compact.item.id, '1');
  assert.equal(compact.matchType, 'compact');

  assert.equal(matcher.lookup(index, 'ZZZ-999'), null);
});

test('state.resolve reports in/out/unknown/loading/unconfigured/error', () => {
  const now = 1_700_000_000_000;
  const config = {
    activeServer: 'emby',
    servers: {
      emby: {
        type: 'emby',
        enabled: true,
        baseUrl: 'http://h:8096/emby',
        apiKey: 'key',
        serverName: 'Home',
        ttlMinutes: 30
      }
    }
  };
  const index = {
    schemaVersion: 2,
    servers: {
      emby: {
        ts: now - 60_000,
        byCode: { 'ABC-123': { id: '1', name: 'ABC-123', year: 2023, count: 1 } },
        byCompact: { ABC123: 'ABC-123' },
        total: 10,
        coded: 9,
        coverage: 0.9
      }
    }
  };

  const hit = state.resolve({ config, indexes: index, code: 'ABC-123', now });
  assert.equal(hit.overall, 'in');
  assert.equal(hit.servers.emby.status, 'in');
  assert.equal(hit.servers.emby.ts, now - 60_000);

  const miss = state.resolve({ config, indexes: index, code: 'ZZZ-999', now });
  assert.equal(miss.overall, 'out');
  assert.equal(miss.servers.emby.status, 'out');

  const lowCoverage = JSON.parse(JSON.stringify(index));
  lowCoverage.servers.emby.coverage = 0.2;
  const unknownCoverage = state.resolve({ config, indexes: lowCoverage, code: 'ZZZ-999', now });
  assert.equal(unknownCoverage.servers.emby.status, 'unknown');
  assert.equal(unknownCoverage.servers.emby.reason, 'low-coverage');

  const stale = JSON.parse(JSON.stringify(index));
  stale.servers.emby.ts = now - 31 * 60_000;
  const unknownStale = state.resolve({ config, indexes: stale, code: 'ZZZ-999', now });
  assert.equal(unknownStale.servers.emby.status, 'unknown');
  assert.equal(unknownStale.servers.emby.reason, 'stale');

  const unconfigured = JSON.parse(JSON.stringify(config));
  unconfigured.servers.emby.baseUrl = '';
  const unconfiguredResult = state.resolve({ config: unconfigured, indexes: index, code: 'ABC-123', now });
  assert.equal(unconfiguredResult.overall, 'unconfigured');

  const loading = state.resolve({
    config,
    indexes: { schemaVersion: 2, servers: {} },
    code: 'ABC-123',
    syncing: { emby: true },
    now
  });
  assert.equal(loading.overall, 'loading');

  const failed = state.resolve({
    config,
    indexes: { schemaVersion: 2, servers: {} },
    code: 'ABC-123',
    errors: { emby: 'boom' },
    now
  });
  assert.equal(failed.overall, 'error');
  assert.equal(failed.servers.emby.message, 'boom');
});

test('isStale respects TTL', () => {
  const now = 1_700_000_000_000;
  assert.equal(state.isStale({ ts: now - 29 * 60_000 }, 30, now), false);
  assert.equal(state.isStale({ ts: now - 31 * 60_000 }, 30, now), true);
  assert.equal(state.isStale(null, 30, now), true);
});
