"use strict";

/**
 * Thin, failure-tolerant wrapper around localStorage.
 *
 * Only non-sensitive UI state is persisted: favourites, recently used tool ids,
 * theme and small per-tool display preferences. Tool input is never stored.
 */

const PREFIX = "devtoolbox:";
const KEY_FAVORITES = `${PREFIX}favorites`;
const KEY_RECENT = `${PREFIX}recent`;
const KEY_THEME = `${PREFIX}theme`;
const KEY_PREFS = `${PREFIX}prefs`;

const RECENT_LIMIT = 8;

/** Emits `favorites`, `recent` and `theme` events so the shell can re-render. */
export const storageEvents = new EventTarget();

let available = true;

function read(key, fallback) {
    if (!available) return fallback;
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function write(key, value) {
    if (!available) return false;
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        available = false;
        return false;
    }
}

function emit(name, detail) {
    storageEvents.dispatchEvent(new CustomEvent(name, { detail }));
}

export function isStorageAvailable() {
    try {
        const probe = `${PREFIX}probe`;
        localStorage.setItem(probe, "1");
        localStorage.removeItem(probe);
        return true;
    } catch {
        available = false;
        return false;
    }
}

/* --- Favourites ---------------------------------------------------------- */

export function getFavorites() {
    const value = read(KEY_FAVORITES, []);
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
}

export function isFavorite(toolId) {
    return getFavorites().includes(toolId);
}

/** Returns the new favourite state for the tool. */
export function toggleFavorite(toolId) {
    const favorites = getFavorites();
    const index = favorites.indexOf(toolId);
    if (index === -1) favorites.push(toolId);
    else favorites.splice(index, 1);
    write(KEY_FAVORITES, favorites);
    emit("favorites", favorites);
    return index === -1;
}

/* --- Recently used ------------------------------------------------------- */

export function getRecent() {
    const value = read(KEY_RECENT, []);
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
}

export function pushRecent(toolId) {
    const recent = getRecent().filter((id) => id !== toolId);
    recent.unshift(toolId);
    const trimmed = recent.slice(0, RECENT_LIMIT);
    write(KEY_RECENT, trimmed);
    emit("recent", trimmed);
}

export function clearRecent() {
    write(KEY_RECENT, []);
    emit("recent", []);
}

/* --- Theme --------------------------------------------------------------- */

export function getThemePreference() {
    const value = read(KEY_THEME, "system");
    return ["light", "dark", "system"].includes(value) ? value : "system";
}

export function setThemePreference(value) {
    write(KEY_THEME, value);
    emit("theme", value);
}

/* --- Per-tool UI preferences --------------------------------------------- */

export function getPref(toolId, key, fallback) {
    const prefs = read(KEY_PREFS, {});
    return prefs?.[toolId]?.[key] ?? fallback;
}

export function setPref(toolId, key, value) {
    const prefs = read(KEY_PREFS, {});
    if (!prefs[toolId]) prefs[toolId] = {};
    prefs[toolId][key] = value;
    write(KEY_PREFS, prefs);
}
