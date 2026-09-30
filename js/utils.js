"use strict";

/**
 * Generic helpers shared by the shell and every tool.
 * No DOM component logic lives here — see ui.js for that.
 */

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function debounce(fn, wait = 150) {
    let timer = 0;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function byteLength(text) {
    return new TextEncoder().encode(text).length;
}

export function formatNumber(value) {
    return Number(value).toLocaleString();
}

export function formatBytes(bytes, decimals = 2) {
    if (!Number.isFinite(bytes)) return "—";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** i;
    return `${Number(value.toFixed(i === 0 ? 0 : decimals))} ${units[i]}`;
}

export function pluralize(count, singular, plural = `${singular}s`) {
    return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** Copy text using the async clipboard API with a legacy fallback. */
export async function copyToClipboard(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* fall through to the legacy path */
    }
    try {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.append(helper);
        helper.select();
        const ok = document.execCommand("copy");
        helper.remove();
        return ok;
    } catch {
        return false;
    }
}

export function downloadText(filename, content, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Split a string into lines without inventing a trailing empty line. */
export function toLines(text) {
    return text.length === 0 ? [] : text.replace(/\r\n?/g, "\n").split("\n");
}

export function titleCaseWord(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Split an identifier of any casing into its component words. */
export function splitWords(text) {
    return text
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean);
}

export function pad2(value) {
    return String(value).padStart(2, "0");
}

/** Local time as an ISO-like string with offset, e.g. 2026-09-30T14:05:00+05:30. */
export function toLocalIso(date) {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
        `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
        `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export function relativeTime(fromDate, now = new Date()) {
    const seconds = Math.round((fromDate.getTime() - now.getTime()) / 1000);
    const steps = [
        ["year", 31536000],
        ["month", 2592000],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
        ["second", 1],
    ];
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, secondsPerUnit] of steps) {
        if (Math.abs(seconds) >= secondsPerUnit || unit === "second") {
            return rtf.format(Math.round(seconds / secondsPerUnit), unit);
        }
    }
    return "";
}

/** Unicode-safe base64 encoding. */
export function base64Encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/** Unicode-safe base64 decoding. Throws on malformed input. */
export function base64Decode(encoded) {
    const binary = atob(encoded.replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function base64UrlDecode(encoded) {
    let normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    return base64Decode(normalized);
}

export function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cryptographically strong random integer in [0, max). */
export function randomInt(max) {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / max) * max;
    let value;
    do {
        crypto.getRandomValues(buffer);
        value = buffer[0];
    } while (value >= limit);
    return value % max;
}

export function randomItem(list) {
    return list[randomInt(list.length)];
}

export function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
