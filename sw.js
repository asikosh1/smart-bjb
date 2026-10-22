// Smart-БЖБ/ТЖБ service worker — app shell cache with network-first for static assets.
// Do NOT intercept Firebase / Google API requests (auth, firestore, storage, functions).
const CACHE = "smartbjb-v1";
const SHELL = [
  "/index.html",
  "/teacher.html",
  "/student.html",
  "/student-auth.html",
  "/create.html",
  "/result.html",
  "/admin.html",
  "/css/style.css",
  "/manifest.json",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-maskable-512.png",
];

// External hosts that must always go to the network (Firebase, Google, CDNs for runtime libs)
const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseio.com",
  "firebasestorage.googleapis.com",
  "cloudfunctions.net",
  "firestore.googleapis.com",
  "www.gstatic.com",
  "cdn.jsdelivr.net",
  "api.qrserver.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

function shouldBypass(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return true;
    return BYPASS_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return true;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (shouldBypass(url)) return; // let the browser handle it normally

  // Network-first for navigations and same-origin statics, fallback to cache (offline shell)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("/index.html"))
      )
  );
});
