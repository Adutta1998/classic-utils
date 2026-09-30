"use strict";

/**
 * DevToolbox service worker.
 *
 * Strategy:
 *   - Pre-cache the shell on install so the app opens offline.
 *   - Navigations: network first, falling back to the cached shell.
 *   - Same-origin assets: stale-while-revalidate.
 *   - Cross-origin requests are never touched.
 */

const VERSION = "v2";
const CACHE_NAME = `devtoolbox-${VERSION}`;

const PRECACHE = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./css/variables.css",
    "./css/layout.css",
    "./css/components.css",
    "./css/tools.css",
    "./js/app.js",
    "./js/router.js",
    "./js/registry.js",
    "./js/storage.js",
    "./js/ui.js",
    "./js/utils.js",
    "./js/lib/yaml.js",
    "./js/lib/json-error.js",
    "./js/lib/qrcode.js",
    "./assets/icons/icon.svg",
    "./assets/icons/icon-192.svg",
    "./assets/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Tool modules are cached on first use, so a missing file never blocks install.
        await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener("message", (event) => {
    if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
                return response;
            } catch {
                const cached = await caches.match(request);
                return cached ?? (await caches.match("./index.html")) ?? Response.error();
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const network = fetch(request)
            .then((response) => {
                if (response.ok && response.type === "basic") cache.put(request, response.clone());
                return response;
            })
            .catch(() => undefined);
        return cached ?? (await network) ?? Response.error();
    })());
});
