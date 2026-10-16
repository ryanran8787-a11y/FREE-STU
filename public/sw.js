// FREE-STU service worker（手寫，不依賴 next-pwa：Turbopack 下 workbox 插件不跑）。
// 策略保守：API（/api/*）一律只走網路、絕不緩存；靜態殼 cache-first；頁面 network-first，斷線 fallback /offline。
// 發版時改 CACHE 名（見 HANDOFF），舊快取在 activate 清掉。
const CACHE = "free-stu-v1";
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 資料請求：永遠打網路（tRPC、音檔、SSE 都不能吃 stale）
  if (url.pathname.startsWith("/api/")) return;
  // 靜態資源：快取優先
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  // 頁面導航：網路優先，斷線才 fallback
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
});
