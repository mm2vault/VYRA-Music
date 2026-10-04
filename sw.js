const CACHE="vyra-shell-v20261004-3";
const SHELL=["./","./index.html","./style.css?v=20261004-3","./app.js?v=20261004-3","./manifest.json","./icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const u=new URL(event.request.url);
  if(u.origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response;
  }).catch(()=>caches.match("./index.html"))));
});