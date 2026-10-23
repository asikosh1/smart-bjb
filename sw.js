const CACHE = "smartbjb-v2";
  const SHELL = [
    "index.html",
    "teacher.html",
    "student.html",
    "student-auth.html",
    "create.html",
    "result.html",
    "admin.html",
    "css/style.css",
    "manifest.json",
    "assets/icons/icon-192.png",
    "assets/icons/icon-512.png",
    "assets/icons/icon-maskable-512.png",
  ];

  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) =>
          // каждый файл кэшируется отдельно — один 404 не ломает установку
          Promise.allSettled(SHELL.map((url) => cache.add(url)))
        )
        .then(() => self.skipWaiting())
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

    const url = new URL(req.url);
    // не трогаем Firebase, Google, CDN — только свои файлы
    if (url.origin !== self.location.origin) return;

    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
  });
