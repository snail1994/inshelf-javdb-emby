import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

require('../src/core/namespace.js');
const codes = require('../src/core/codes.js'); // eslint-disable-line no-unused-vars
const serverRegistry = require('../src/servers/registry.js');
const emby = require('../src/servers/emby.js');
const siteRegistry = require('../src/sites/registry.js');
const javdb = require('../src/sites/javdb.js');

serverRegistry.register(emby);
siteRegistry.register(javdb);

function fakeHttp(handler) {
  return {
    getJson(url, headers, timeout) {
      return Promise.resolve(handler(url, headers, timeout));
    }
  };
}

test('registries resolve the built-in adapters', () => {
  assert.equal(serverRegistry.get('emby'), emby);
  assert.equal(siteRegistry.get('javdb'), javdb);
  assert.equal(serverRegistry.get('missing'), null);
  assert.equal(siteRegistry.get('missing'), null);
});

test('registry validates adapter contracts', () => {
  assert.throws(
    () => serverRegistry.register({ id: 'broken', name: 'Broken' }),
    /missing normalizeBaseUrl/
  );
  assert.throws(
    () => siteRegistry.register({ id: 'broken', name: 'Broken' }),
    /missing isActive/
  );
});

test('a new site adapter can be registered without touching core', () => {
  const dummy = {
    id: 'dummy',
    name: 'Dummy',
    isActive: () => false,
    isDetailPage: () => false,
    getDetailCode: () => null,
    getDetailMount: () => null,
    getListItems: () => []
  };
  siteRegistry.register(dummy);
  assert.equal(siteRegistry.get('dummy'), dummy);
});

test('Emby URL candidates try / and /emby', () => {
  assert.deepEqual(emby.candidateBaseUrls('http://h:8096'), [
    'http://h:8096',
    'http://h:8096/emby'
  ]);
  assert.deepEqual(emby.candidateBaseUrls('http://h:8096/emby/'), [
    'http://h:8096/emby',
    'http://h:8096'
  ]);
  assert.equal(emby.normalizeBaseUrl('192.168.1.10:8096'), 'http://192.168.1.10:8096');
  assert.equal(emby.normalizeBaseUrl(''), '');
});

test('testConnection falls back to /emby and reports server identity', async () => {
  const http = fakeHttp((url) => {
    if (url === 'http://h:8096/emby/System/Info') {
      return { status: 200, data: { Id: 's1', ServerName: 'Home', Version: '4.8.0' } };
    }
    return { status: 404, data: null };
  });

  const result = await emby.testConnection({ baseUrl: 'http://h:8096', apiKey: 'key' }, http);
  assert.equal(result.ok, true);
  assert.equal(result.baseUrl, 'http://h:8096/emby');
  assert.equal(result.serverId, 's1');
  assert.equal(result.serverName, 'Home');
  assert.equal(result.version, '4.8.0');
});

test('testConnection reports 401 without throwing', async () => {
  const http = fakeHttp(() => ({ status: 401, data: null }));
  const result = await emby.testConnection(
    { baseUrl: 'http://h:8096/emby', apiKey: 'bad' },
    http
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.message, /401/);
});

test('testConnection reports network errors without throwing', async () => {
  const http = {
    getJson() {
      return Promise.reject(new Error('boom'));
    }
  };
  const result = await emby.testConnection(
    { baseUrl: 'http://h:8096', apiKey: 'key' },
    http
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.message, /boom/);
});

test('fetchLibrary paginates and reports progress', async () => {
  const seen = [];
  const progress = [];
  const http = fakeHttp((url) => {
    seen.push(url);
    if (url.includes('StartIndex=0')) {
      return {
        status: 200,
        data: {
          Items: [{ Id: '1', Name: 'ABC-123', Path: '/media/ABC-123.mp4' }],
          TotalRecordCount: 2
        }
      };
    }
    if (url.includes('StartIndex=1')) {
      return {
        status: 200,
        data: {
          Items: [{ Id: '2', Name: 'DEF-456', Path: '/media/DEF-456.mp4' }],
          TotalRecordCount: 2
        }
      };
    }
    return { status: 404, data: null };
  });

  const result = await emby.fetchLibrary(
    { baseUrl: 'http://h:8096/emby', apiKey: 'key', limit: 1, pageDelayMs: 0 },
    http,
    (p) => progress.push(p)
  );

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, 'ABC-123');
  assert.equal(result.items[1].path, '/media/DEF-456.mp4');
  assert.equal(result.total, 2);
  assert.equal(result.truncated, false);
  assert.equal(progress.length, 2);
  assert.equal(progress[0].page, 1);
  assert.equal(progress[1].page, 2);
  assert.ok(seen[0].includes('IncludeItemTypes=Movie%2CVideo'));
  assert.ok(seen[0].includes('Fields=Path%2COriginalTitle%2CProductionYear'));
});

test('fetchLibrary surfaces HTTP failures', async () => {
  const http = fakeHttp(() => ({ status: 401, data: null }));
  await assert.rejects(
    () => emby.fetchLibrary({ baseUrl: 'http://h:8096/emby', apiKey: 'bad' }, http),
    /401/
  );
});

test('Emby deep links and search links are stable', () => {
  assert.equal(
    emby.buildItemUrl({ baseUrl: 'http://h:8096/emby', serverId: 's1' }, { id: 'abc' }),
    'http://h:8096/emby/web/index.html#!/item?id=abc&serverId=s1'
  );
  assert.equal(
    emby.buildItemUrl({ baseUrl: 'http://h:8096/emby' }, null),
    'http://h:8096/emby/web/index.html'
  );
  assert.equal(
    emby.buildSearchUrl({ baseUrl: 'http://h:8096/emby' }, 'ABC-123'),
    'http://h:8096/emby/web/index.html#!/search?query=ABC-123'
  );
});

test('JavDB pure parsers extract codes from titles', () => {
  assert.equal(javdb.parseDetailCode('ABC-123'), 'ABC-123');
  assert.equal(javdb.parseDetailCode('中文标题'), null);
  assert.deepEqual(javdb.parseListTitle('ABC-123 标题'), ['ABC-123']);
  assert.deepEqual(javdb.parseListTitle('中文标题'), []);
  assert.equal(javdb.isActive({ hostname: 'javdb.com' }), true);
  assert.equal(javdb.isActive({ hostname: 'example.com' }), false);
});

test('JavDB list items mount the badge at the code, not the clipped title tail', () => {
  function makeItem(strongText, titleText) {
    const strong = strongText == null ? null : { textContent: strongText };
    const title = {
      textContent: `${strongText || ''} ${titleText || ''}`.trim(),
      querySelector(sel) {
        return sel === 'strong' ? strong : null;
      },
      classList: { contains: (name) => name === 'video-title' },
      firstChild: {}
    };
    const item = {
      querySelector(sel) {
        if (sel === '.video-title') return title;
        if (sel === 'a[href*="/v/"]') return null;
        return null;
      }
    };
    return { item, title, strong };
  }

  const withStrong = makeItem('FC2-4958983', '約束された神回');
  const withoutStrong = makeItem(null, 'FC2-4958983 約束された神回');
  const doc = {
    querySelectorAll: () => [withStrong.item, withoutStrong.item]
  };

  const items = javdb.getListItems(doc);
  assert.equal(items.length, 2);
  assert.equal(items[0].code, 'FC2-4958983');
  assert.equal(items[0].mount, withStrong.strong);
  assert.equal(items[1].code, 'FC2-4958983');
  assert.equal(items[1].mount, withoutStrong.title);
});
