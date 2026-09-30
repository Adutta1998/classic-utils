"use strict";

import { el, panel, textarea, statusBox, copyButton, countMeta, checkbox } from "../ui.js";
import { bytesToHex } from "../utils.js";

const ALGORITHMS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

function toBase64(buffer) {
    let binary = "";
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function hashGenerator(host) {
    const input = textarea({ placeholder: "Text to hash…", "aria-label": "Text to hash" });
    const status = statusBox();
    const rowsHost = el("div", { class: "tool-body" });
    const digests = new Map();
    let asBase64 = false;

    function render() {
        rowsHost.replaceChildren();
        if (!digests.size) {
            rowsHost.append(el("p", { class: "small muted", text: "Type or paste text to see its digests." }));
            return;
        }
        for (const algorithm of ALGORITHMS) {
            const buffer = digests.get(algorithm);
            if (!buffer) continue;
            const value = asBase64 ? toBase64(buffer) : bytesToHex(buffer);
            rowsHost.append(panel(
                { title: algorithm, actions: [copyButton(() => value, { small: true })] },
                el("p", { class: "mono small wrap-anywhere", text: value }),
            ));
        }
    }

    async function compute() {
        status.reset();
        digests.clear();
        const text = input.value;
        if (!text) {
            render();
            return;
        }
        if (!crypto.subtle) {
            status.error("Web Crypto is unavailable", "Hashing requires a secure context (https:// or localhost).");
            render();
            return;
        }
        const data = new TextEncoder().encode(text);
        try {
            await Promise.all(ALGORITHMS.map(async (algorithm) => {
                digests.set(algorithm, await crypto.subtle.digest(algorithm, data));
            }));
            render();
        } catch (error) {
            status.error("Hashing failed", error.message);
        }
    }

    input.addEventListener("input", compute);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Input", meta: countMeta(input) }, input),
        panel(
            { title: "Output format" },
            checkbox("Show digests as Base64 instead of hex", {
                onChange: (checked) => { asBase64 = checked; render(); },
            }),
            el("p", {
                class: "small muted",
                text: "MD5 is deliberately omitted: it is not part of the browser crypto API and is unsafe for integrity checks.",
            }),
        ),
        status,
        rowsHost,
    ));

    render();
    input.focus();
}
