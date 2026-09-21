/* CACHE_NAME qo'lda oshiriladi. Media/API/ffmpeg tegilmaydi. */
var CACHE_NAME = 'emr-shell-v1';
var PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/canvas.css',
  '/css/fonts.css',
  '/css/legal.css',
  '/css/login.css',
  '/css/media-blocks.css',
  '/css/preview.css',
  '/css/responsive.css',
  '/css/tablet.css',
  '/css/timeline-scrollbar.css',
  '/css/timeline.css',
  '/css/toolbar.css',
  '/css/transition-toast.css',
  '/css/upload.css',
  '/js/add-media.js',
  '/js/auth.js',
  '/js/canvas.js',
  '/js/captions-beta.js',
  '/js/context-menu.js',
  '/js/dom.js',
  '/js/drag.js',
  '/js/export-core.js',
  '/js/export-render.js',
  '/js/export.js',
  '/js/exporter.js',
  '/js/helpers.js',
  '/js/history.js',
  '/js/login.js',
  '/js/mobile-toolbar.js',
  '/js/music-sync.js',
  '/js/music.js',
  '/js/playback.js',
  '/js/projects.js',
  '/js/pwa-core.js',
  '/js/resize-handle.js',
  '/js/selection.js',
  '/js/state.js',
  '/js/storage.js',
  '/js/strings.js',
  '/js/subtitles.js',
  '/js/supabase-config.js',
  '/js/text-core.js',
  '/js/text-fonts.js',
  '/js/text-overlay.js',
  '/js/timeline.js',
  '/js/transition-toast.js',
  '/js/upload.js',
  '/js/video-blocks.js',
  '/js/zoom.js',
  '/js/vendor/supabase.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-192-maskable.png',
  '/assets/icon-512-maskable.png',
  '/assets/logo.png',
  '/favicon.ico'
];
function extOf(p){var i=p.lastIndexOf('.');return i<0?'':p.slice(i).toLowerCase();}
function shouldCacheUrl(url){
  try{
    var u=new URL(url);
    if(u.origin!==self.location.origin) return false;
    var h=u.hostname;
    if(/\.supabase\.co$/i.test(h)||h==='cdn.jsdelivr.net'||/huggingface\.co$/i.test(h)) return false;
    var e=extOf(u.pathname);
    if(e==='.mp4'||e==='.webm'||e==='.wasm') return false;
    if(u.pathname==='/'||u.pathname==='/index.html') return true;
    return ['.html','.css','.js','.json','.woff2','.png','.ico','.svg','.webp'].indexOf(e)!==-1;
  }catch(_){return false;}
}
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE_NAME).then(function(c){
    return Promise.all(PRECACHE.map(function(u){return c.add(u).catch(function(){});}));
  }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
  }));
});
self.addEventListener('message',function(e){ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET') return;
  if(!shouldCacheUrl(req.url)) return;
  e.respondWith(caches.open(CACHE_NAME).then(function(cache){
    return cache.match(req).then(function(hit){
      var net=fetch(req).then(function(res){ if(res&&res.ok) cache.put(req,res.clone()).catch(function(){}); return res; }).catch(function(){ return hit; });
      return hit||net;
    });
  }));
});
