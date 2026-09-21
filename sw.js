/* CACHE_NAME oshiriladi — yangi deploy ko'rinsin. Media/API/ffmpeg cache qilinmaydi. */
var CACHE_NAME = 'emr-shell-v4';
var PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/login.css',
  '/css/upload.css',
  '/js/auth.js',
  '/js/login.js',
  '/js/supabase-config.js',
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
    if(u.pathname==='/'||u.pathname==='/index.html'||u.pathname.indexOf('/login')===0) return true;
    return ['.html','.css','.js','.json','.woff2','.png','.ico','.svg','.webp'].indexOf(e)!==-1;
  }catch(_){return false;}
}
function isShell(url){
  try{
    var u=new URL(url);
    var p=u.pathname;
    var e=extOf(p);
    return p==='/'||p==='/index.html'||p.indexOf('/login')===0||e==='.html'||e==='.js'||e==='.css';
  }catch(_){return false;}
}
self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(function(c){
    return Promise.all(PRECACHE.map(function(u){return c.add(u).catch(function(){});}));
  }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('message',function(e){ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET') return;
  if(!shouldCacheUrl(req.url)) return;
  // HTML/JS/CSS — avval tarmoq (yangi deploy ko'rinsin), offline bo'lsa cache
  if(isShell(req.url)){
    e.respondWith(
      fetch(req).then(function(res){
        if(res&&res.ok){
          var clone=res.clone();
          caches.open(CACHE_NAME).then(function(c){ c.put(req,clone).catch(function(){}); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){ return hit || caches.match('/index.html'); });
      })
    );
    return;
  }
  e.respondWith(caches.open(CACHE_NAME).then(function(cache){
    return cache.match(req).then(function(hit){
      var net=fetch(req).then(function(res){ if(res&&res.ok) cache.put(req,res.clone()).catch(function(){}); return res; }).catch(function(){ return hit; });
      return hit||net;
    });
  }));
});
