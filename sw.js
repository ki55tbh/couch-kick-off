// Couch Kick-Off: keeps the font files on the phone so they show instantly on every visit.
// It only ever handles /fonts/ files. Pages and fixture data always come fresh from the website.
// If the font files ever change, bump VERSION so phones fetch the new ones.
const VERSION='ck-fonts-v1';
const FONTS=['/fonts/hind-latin-500-normal.woff2','/fonts/hind-latin-600-normal.woff2','/fonts/hind-latin-700-normal.woff2','/fonts/hind-latin-ext-500-normal.woff2','/fonts/hind-latin-ext-600-normal.woff2','/fonts/hind-latin-ext-700-normal.woff2','/fonts/inter-latin-400-normal.woff2','/fonts/inter-latin-500-normal.woff2','/fonts/inter-latin-600-normal.woff2','/fonts/inter-latin-700-normal.woff2','/fonts/inter-latin-800-normal.woff2','/fonts/inter-latin-ext-400-normal.woff2','/fonts/inter-latin-ext-500-normal.woff2','/fonts/inter-latin-ext-600-normal.woff2','/fonts/inter-latin-ext-700-normal.woff2','/fonts/inter-latin-ext-800-normal.woff2','/fonts/outfit-latin-500-normal.woff2','/fonts/outfit-latin-600-normal.woff2','/fonts/outfit-latin-700-normal.woff2','/fonts/outfit-latin-800-normal.woff2','/fonts/outfit-latin-ext-500-normal.woff2','/fonts/outfit-latin-ext-600-normal.woff2','/fonts/outfit-latin-ext-700-normal.woff2','/fonts/outfit-latin-ext-800-normal.woff2'];
self.addEventListener('install',e=>{
  if(e.addRoutes){try{e.addRoutes([{condition:{urlPattern:new URLPattern({pathname:'/fonts/*'})},source:'cache'}])}catch(_){}}
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FONTS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// Browsers without the font route (Safari, Firefox) use this instead; it ignores everything except /fonts/.
if(!('addRoutes' in (self.InstallEvent?InstallEvent.prototype:{}))){
  self.addEventListener('fetch',e=>{
    const u=new URL(e.request.url);
    if(u.origin!==location.origin||!u.pathname.startsWith('/fonts/'))return;
    e.respondWith(caches.open(VERSION).then(c=>c.match(e.request,{ignoreVary:true}).then(r=>r||fetch(e.request).then(n=>{if(n.ok)c.put(e.request,n.clone());return n}))));
  });
}
