/* ============================================================
   VODOVSKY MONEY · sw.js v3.0.1
   Офлайн-оболочка приложения.

   ПРАВИЛА БЕЗОПАСНОСТИ:
   - Supabase, шрифты и CDN НЕ перехватываются никогда.
   - Авторизация и данные всегда идут напрямую в сеть.
   - Кэшируются только свои статические файлы.
   - При наличии сети всегда берём свежую версию с GitHub.
   ============================================================ */

'use strict';

var VERSION = 'vodovsky-money-v3.0.1';
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './data.js',
  './app.js',
  './pwa.js',
  './icon.svg',
  './manifest.webmanifest'
];

var OFFLINE_HTML =
  '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>VODOVSKY MONEY — нет сети</title><style>' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;' +
  'background:#080B10;color:#EEF2F8;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-align:center}' +
  '.m{width:66px;height:66px;margin:0 auto 18px;border-radius:21px;display:grid;place-items:center;' +
  'background:linear-gradient(135deg,#FFDD2D,#FFB020)}' +
  '.m svg{width:37px;height:37px}' +
  'b{display:block;font-size:19px;font-weight:800;margin-bottom:8px}' +
  'p{font-size:13.5px;color:#8E99B0;line-height:1.6;max-width:330px;margin:0 auto 22px}' +
  'button{font:inherit;font-weight:700;font-size:13.5px;padding:12px 22px;border:none;border-radius:14px;' +
  'background:linear-gradient(135deg,#FFDD2D,#FFB020);color:#161510;cursor:pointer}' +
  '</style></head><body><div>' +
  '<div class="m"><svg viewBox="0 0 24 24"><path d="M4 4l8 16 8-16h-4.2L12 12.6 8.2 4H4z" fill="#161510"/></svg></div>' +
  '<b>Нет подключения</b>' +
  '<p>VODOVSKY MONEY нужен интернет для входа и синхронизации с Supabase. Проверь сеть и попробуй снова.</p>' +
  '<button onclick="location.reload()">Обновить</button>' +
  '</div></body></html>';

/* ---------- УСТАНОВКА ---------- */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // Каждый файл отдельно: если какого-то ещё нет — установка не ломается.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () {
      return caches.open(VERSION).then(function (cache) {
        return cache.put('./__offline__', new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }));
      });
    })
  );
});

/* ---------- АКТИВАЦИЯ ---------- */

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== VERSION && key.indexOf('vodovsky-money-') === 0) {
          return caches.delete(key);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- ОБНОВЛЕНИЕ ПО КОМАНДЕ СТРАНИЦЫ ---------- */

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }));
  }
});

/* ---------- ЗАПРОСЫ ---------- */

function isExternal(url) {
  return url.origin !== self.location.origin;
}

function isSensitive(url, request) {
  var p = url.pathname.toLowerCase();
  if (p.indexOf('/auth/') >= 0) return true;
  if (p.indexOf('/rest/') >= 0) return true;
  if (p.indexOf('/storage/') >= 0) return true;
  if (p.indexOf('/realtime') >= 0) return true;
  if (p.indexOf('/functions/') >= 0) return true;
  if (request.headers.get('authorization')) return true;
  if (request.headers.get('apikey')) return true;
  if (url.search.indexOf('apikey') >= 0) return true;
  return false;
}

function fromNetwork(request, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) { settled = true; reject(new Error('timeout')); }
    }, timeoutMs);

    fetch(request).then(function (response) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    }).catch(function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  var copy = response.clone();
  caches.open(VERSION).then(function (cache) {
    cache.put(request, copy).catch(function () {});
  }).catch(function () {});
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  // Supabase, Google Fonts, jsDelivr и любые чужие домены — только сеть.
  if (isExternal(url)) return;
  if (isSensitive(url, request)) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Переходы по страницам: сеть → кэш → офлайн-экран.
  if (request.mode === 'navigate') {
    event.respondWith(
      fromNetwork(request, 4000).then(function (response) {
        putInCache(request, response);
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          return caches.match('./index.html').then(function (shell) {
            if (shell) return shell;
            return caches.match('./__offline__').then(function (offline) {
              return offline || new Response(OFFLINE_HTML, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              });
            });
          });
        });
      })
    );
    return;
  }

  // Свои файлы: сеть → кэш. Так обновления с GitHub видны сразу.
  event.respondWith(
    fromNetwork(request, 4000).then(function (response) {
      putInCache(request, response);
      return response;
    }).catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
