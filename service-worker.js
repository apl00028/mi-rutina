const CACHE="gymos-cache-4.2.0-routine-hub";
const ASSETS=["./","index.html","styles.css","app.js","vendor/xlsx.full.min.js","auth-config.js","daily-thoughts.js","assets/heroes/manifest.js","recovery-center.js","professional-nutrition.js","nutrition-engine.js","workout-analysis.js","exercise-domain.js","profile-data.js","routine-session-model.js","routine-session-migration.js","routine-session-runtime.js","routine-generator.js","routine-proposals.js","routine-activation.js","routine-io.js","routine-excel.js","exercise-library-workflow.js","active-workout.js","workout-progress.js","routine-workflow-ui.js","routine-hub.js","manifest.json","icon-192.png","icon-512.png","plantilla-rutina-gymos.xlsx","README-SYNC.md","supabase-schema.sql","supabase-body-measurements.sql","supabase-workout-analyses.sql","THIRD_PARTY_NOTICES.md"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>{
  e.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(
      keys.filter(key=>key.startsWith("gymos-cache-")&&key!==CACHE).map(key=>caches.delete(key))
    )),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=="GET"||url.origin!==self.location.origin){
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    fetch(e.request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(e.request,copy));
      }
      return response;
    }).catch(async()=>{
      const cached=await caches.match(e.request);
      if(cached) return cached;
      if(e.request.mode==="navigate") return caches.match("./");
      throw new Error("offline_asset_unavailable");
    })
  );
});
