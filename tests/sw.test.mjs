import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the actual worker's event handlers with browser APIs simulated in Node.
// These checks complement, rather than replace, an offline test in a real browser.
const workerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function createWorker({ scope = 'https://example.test/pwa-billetera/', failPrecache = false } = {}) {
  const listeners = new Map();
  const cacheStorage = new Map([
    ['mi-billetera-lite-obsolete', new Map()],
    ['unrelated-app-cache', new Map()],
  ]);
  const networkRequests = [];
  let offline = true;
  let rejectCacheWrites = false;
  let claimed = false;
  let skipped = false;

  const caches = {
    async open(name) {
      if (!cacheStorage.has(name)) cacheStorage.set(name, new Map());
      const entries = cacheStorage.get(name);
      return {
        async addAll(paths) {
          if (failPrecache) throw new TypeError('An App Shell resource is unavailable');
          for (const path of paths) {
            entries.set(new URL(path, scope).href, new Response(`cached:${path}`));
          }
        },
        async match(key) {
          return entries.get(typeof key === 'string' ? key : key.url)?.clone();
        },
        async put(key, response) {
          if (rejectCacheWrites) throw new Error('Storage quota exceeded');
          entries.set(typeof key === 'string' ? key : key.url, response);
        },
      };
    },
    async keys() { return [...cacheStorage.keys()]; },
    async delete(name) { return cacheStorage.delete(name); },
  };

  const self = {
    registration: { scope },
    location: { origin: new URL(scope).origin },
    clients: { async claim() { claimed = true; } },
    async skipWaiting() { skipped = true; },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };

  runInNewContext(workerSource, {
    self, caches, URL, Response, Set,
    fetch: async (request) => {
      networkRequests.push(request.url);
      if (offline) throw new TypeError('Network is offline');
      const response = new Response('from network');
      Object.defineProperty(response, 'type', { value: 'basic' });
      return response;
    },
  });

  return {
    scope, cacheStorage, networkRequests,
    get claimed() { return claimed; },
    get skipped() { return skipped; },
    get shell() {
      return [...cacheStorage.values()].find((entries) => entries.has(`${scope}index.html`));
    },
    setOnline() { offline = false; },
    fillStorage() { rejectCacheWrites = true; },
    async lifecycle(name) {
      let work;
      listeners.get(name)({ waitUntil(promise) { work = promise; } });
      await work;
    },
    async request(path, options = {}) {
      let response;
      listeners.get('fetch')({
        request: { url: new URL(path, scope).href, method: 'GET', mode: 'cors', ...options },
        respondWith(promise) { response = promise; },
      });
      return response && await response;
    },
    message(data) { listeners.get('message')({ data }); },
  };
}

test('installation precaches every asset required by the application', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  for (const path of [
    './', 'index.html', 'styles.css', 'app.js', 'storage.js', 'manifest.json',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg',
  ]) {
    assert.ok(worker.shell.has(new URL(path, worker.scope).href), `Missing ${path}`);
  }
  assert.equal(worker.skipped, false, 'A new version should not force a page reload');
});

test('installation fails when a required App Shell resource cannot be cached', async () => {
  const worker = createWorker({ failPrecache: true });
  await assert.rejects(worker.lifecycle('install'), /App Shell resource is unavailable/);
});

test('offline navigation works at both a project subpath and an origin root', async () => {
  for (const scope of ['https://example.test/pwa-billetera/', 'https://example.test/']) {
    const worker = createWorker({ scope });
    await worker.lifecycle('install');
    for (const path of ['./', './?source=installed', './index.html?source=bookmark']) {
      const response = await worker.request(path, { mode: 'navigate' });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'cached:./index.html');
    }
    assert.equal(worker.networkRequests.length, 0);
  }
});

test('cached App Shell resources are served before the network, including query strings', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  worker.setOnline();
  const response = await worker.request('./styles.css?v=release');
  assert.equal(await response.text(), 'cached:./styles.css');
  assert.equal(worker.networkRequests.length, 0);
});

test('an evicted App Shell asset falls back to the network and is cached again', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  worker.shell.delete(`${worker.scope}styles.css`);
  worker.setOnline();
  const response = await worker.request('./styles.css');
  assert.equal(await response.text(), 'from network');
  assert.equal(worker.networkRequests.length, 1);
  assert.ok(worker.shell.has(`${worker.scope}styles.css`));
  const secondResponse = await worker.request('./styles.css');
  assert.equal(await secondResponse.text(), 'from network');
  assert.equal(worker.networkRequests.length, 1);
});

test('successful network responses still work when the cache is full', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  worker.shell.delete(`${worker.scope}styles.css`);
  worker.setOnline();
  worker.fillStorage();
  const response = await worker.request('./styles.css');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'from network');
});

test('the worker does not intercept third parties, unrelated files, or mutations', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  assert.equal(await worker.request('https://another-origin.test/app.js'), undefined);
  assert.equal(await worker.request('./personal-data.json'), undefined);
  assert.equal(await worker.request('./app.js', { method: 'POST' }), undefined);
  assert.equal(await worker.request('./app.js', { method: 'DELETE' }), undefined);
  assert.equal(worker.networkRequests.length, 0);
});

test('activation removes obsolete app caches while preserving other applications', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.equal(worker.cacheStorage.has('mi-billetera-lite-obsolete'), false);
  assert.equal(worker.cacheStorage.has('unrelated-app-cache'), true);
  assert.ok(worker.shell, 'The newly installed App Shell should remain cached');
  assert.equal(worker.claimed, true);
});

test('a waiting version activates only after an explicit update message', () => {
  const worker = createWorker();
  worker.message({ type: 'UNRELATED_MESSAGE' });
  assert.equal(worker.skipped, false);
  worker.message({ type: 'SKIP_WAITING' });
  assert.equal(worker.skipped, true);
});
