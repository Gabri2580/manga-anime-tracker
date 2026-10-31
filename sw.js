// Offline: guscio dell'app dalla cache (si aggiorna in background), copertine dalla cache. API e AniList sempre dalla rete.
const V = 'tracker-v4';
const SHELL = ['./', 'index.html', 'app.js', 'stats.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'vendor/supabase.min.js', 'vendor/fonts/outfit.woff2', 'vendor/fonts/work-sans.woff2', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const cover = u.pathname.includes('/storage/v1/object/public/covers/');
  if (u.origin !== location.origin && !cover) return;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(r, { ignoreSearch: !cover });
    const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return cover ? (hit || net) : (hit ? (net.catch(() => {}), hit) : net);
  }));
});
