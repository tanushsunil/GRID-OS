// GRID OS service worker: makes the app installable and shows a simple page when offline.
// Nothing else is cached, so every deploy is picked up straight away.
const OFFLINE='grid-offline-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(OFFLINE).then(c=>c.addAll(['/offline.html','/icon-192.png'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==OFFLINE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 if(e.request.mode!=='navigate')return;
 e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));
});
