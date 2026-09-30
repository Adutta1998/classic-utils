"use strict";

/**
 * Minimal hash router — hash routing keeps deep links working on GitHub Pages
 * and any static host without server rewrites.
 *
 * Routes: #/ , #/category/:id , #/tool/:id
 */

const listeners = new Set();

export function parseRoute(hash = window.location.hash) {
    const path = hash.replace(/^#\/?/, "").trim();
    if (!path) return { name: "home" };

    const [segment, value] = path.split("/");
    if (segment === "tool" && value) return { name: "tool", id: decodeURIComponent(value) };
    if (segment === "category" && value) return { name: "category", id: decodeURIComponent(value) };
    return { name: "home" };
}

export function navigate(path, { replace = false } = {}) {
    const target = path.startsWith("#") ? path : `#${path}`;
    if (window.location.hash === target) {
        notify();
        return;
    }
    if (replace) {
        const url = `${window.location.pathname}${window.location.search}${target}`;
        window.history.replaceState(null, "", url);
        notify();
    } else {
        window.location.hash = target;
    }
}

export const toToolPath = (id) => `#/tool/${encodeURIComponent(id)}`;
export const toCategoryPath = (id) => `#/category/${encodeURIComponent(id)}`;

function notify() {
    const route = parseRoute();
    for (const listener of listeners) listener(route);
}

export function onRouteChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function startRouter() {
    window.addEventListener("hashchange", notify);
    notify();
}
