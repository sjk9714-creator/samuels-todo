// Offline shell for Samuel's To-Do List.
// Data is never cached here — only the app shell and static assets. Task state
// lives in localStorage (written by the app) so a cold offline open still paints.
const CACHE = 'todo-shell-v4';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  // precached so the very first offline open can still boot the app rather
  // than dying on an undefined `supabase` global
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // individual misses must not fail the whole install
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function stash(req, res) {
  if (!res || !res.ok) return res;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Never touch Supabase: stale task data or a cached websocket handshake
  // would be worse than no cache at all.
  if (url.hostname.endsWith('supabase.co')) return;

  // Same-origin (app shell): network-first, so new app code lands immediately
  // and we only fall back to cache when genuinely offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => stash(req, res))
        .catch(() => caches.match(req).then(hit => hit || caches.match('/index.html')))
    );
    return;
  }

  // CDN assets (Supabase client, fonts): immutable, so cache-first.
  if (url.hostname === 'cdn.jsdelivr.net' ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname.endsWith('gstatic.com')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => stash(req, res)))
    );
  }
});
