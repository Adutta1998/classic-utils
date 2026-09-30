"use strict";

import {
    el, panel, field, input, checkbox, codeOutput, copyButton, downloadButton, button, segmented, metaLabel,
} from "../ui.js";
import { clamp, formatNumber } from "../utils.js";

function uuidV4() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuidBytes(bytes);
}

/** RFC 9562 UUID v7: 48-bit Unix millisecond timestamp + random bits. */
function uuidV7() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const timestamp = BigInt(Date.now());
    for (let i = 0; i < 6; i += 1) {
        bytes[i] = Number((timestamp >> BigInt(8 * (5 - i))) & 0xffn);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuidBytes(bytes);
}

function formatUuidBytes(bytes) {
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidGenerator(host) {
    let version = "v4";
    const countInput = input({ type: "number", value: "5", min: "1", max: "1000" });
    const output = codeOutput("Generated identifiers appear here");
    const meta = metaLabel("");

    let options = { uppercase: false, braces: false, hyphens: true };

    function decorate(uuid) {
        let value = uuid;
        if (!options.hyphens) value = value.replace(/-/g, "");
        if (options.uppercase) value = value.toUpperCase();
        if (options.braces) value = `{${value}}`;
        return value;
    }

    function generate() {
        const count = clamp(Number.parseInt(countInput.value, 10) || 1, 1, 1000);
        countInput.value = String(count);
        const make = version === "v7" ? uuidV7 : uuidV4;
        const list = Array.from({ length: count }, () => decorate(make()));
        output.setValue(list.join("\n"));
        meta.textContent = `${formatNumber(count)} generated`;
    }

    const versionSwitch = segmented(
        [
            { value: "v4", label: "UUID v4 (random)" },
            { value: "v7", label: "UUID v7 (time-ordered)" },
        ],
        { value: version, label: "UUID version", onChange: (value) => { version = value; generate(); } },
    );

    const toggles = el(
        "div",
        { class: "check-grid" },
        checkbox("Uppercase", { onChange: (checked) => { options.uppercase = checked; generate(); } }),
        checkbox("Wrap in braces", { onChange: (checked) => { options.braces = checked; generate(); } }),
        checkbox("Hyphens", { checked: true, onChange: (checked) => { options.hyphens = checked; generate(); } }),
    );

    const controls = panel(
        { title: "Options" },
        versionSwitch,
        el("div", { class: "inline-row" }, field("How many", countInput), button("Generate", {
            variant: "primary",
            glyph: "↻",
            onClick: generate,
        })),
        toggles,
        el("p", {
            class: "small muted",
            text: "v4 is fully random. v7 embeds a millisecond timestamp so identifiers sort chronologically — useful as database keys.",
        }),
    );

    const result = panel(
        {
            title: "Identifiers",
            meta,
            actions: [
                copyButton(() => output.getValue(), { label: "Copy all", small: true }),
                downloadButton(() => output.getValue(), "uuids.txt", { small: true }),
            ],
        },
        output,
    );

    host.append(el("div", { class: "tool-body" }, controls, result));
    countInput.addEventListener("input", generate);
    generate();
}
